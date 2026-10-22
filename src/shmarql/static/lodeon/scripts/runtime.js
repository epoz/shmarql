$(function() {

  const fa_aeroplane = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="24" height="24" fill="#ccc"><path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480v-83.6c0-4 1.5-7.8 4.2-10.7l167.6-182.9c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8l-88.3-44.2C7.1 311.3.3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z"></path></svg>`;

  $('.language-sparql').each(function() {
    const $block = $(this);
    const $pre   = $block.find('.code');
    const $code  = $block.find('.code code');
    const query  = encodeURIComponent($code.text());

    const $link = $('<a class="execute" title="sparql.execute">')
      .css('display', 'block')
      .attr('title', 'sparql.execute')
      .attr('href', '/shmarql/?query=' + query)
      .html(fa_aeroplane);

    $code.append($link);
  });

  $('.shmarql-source, .language-shmarql').each(function() {
    const $block = $(this);
    const query  = $block.find('code').text();
    const knowledgeGraphProfileId = findFenceAttribute($block, 'kg');

    if (knowledgeGraphProfileId) {
      executeLodeonSparql($block, knowledgeGraphProfileId, query);
      return;
    }

    $.ajax({
      url: '/shmarql/fragments/sparql',
      method: 'POST',
      data: { query: query },
      dataType: 'html'
    }).done(function(html) {

      // inject SPARQL result table
      $block.html(html);

      // initialise DataTable plugin
      $block.find('table').each(function() {
        if (! $.fn.DataTable.isDataTable(this)) {
          $(this).DataTable({
            scrollX: false,
            paging:   true,
            ordering: true,
            info:     true
          });
        }
      });
    });
  });

  $('.lodeon-visualization-source, .language-lodeon-visualization, .language-text.highlight').each(function(index) {
    const $block = $(this);
    const source = $block.find('code').text();
    const title = findFenceTitle($block);
    const $figure = $('<figure class="lodeon-visualization">');
    const $caption = $('<figcaption class="lodeon-visualization-title">');
    const $plot = $('<div class="lodeon-visualization-plot">');
    const explicitVisualizationFence =
      $block.hasClass('lodeon-visualization-source') ||
      $block.hasClass('language-lodeon-visualization');
    let spec = null;

    try {
      spec = JSON.parse(source);
    } catch (error) {
      if (!explicitVisualizationFence) {
        return;
      }
    }

    if (!explicitVisualizationFence && !isLodeonVisualizationSpec(spec)) {
      return;
    }

    if (title) {
      $caption.text(title);
      $figure.append($caption);
    }

    $figure.append($plot);
    $block.replaceWith($figure);

    try {
      const figure = resolvePlotlyFigure(spec);
      const config = Object.assign(
        { responsive: true, displaylogo: false },
        figure.config || {}
      );

      if (!window.Plotly) {
        throw new Error('lodeon.plotly.unavailable');
      }

      $plot.attr('id', `lodeon-visualization-${index + 1}`);
      window.Plotly.newPlot($plot[0], figure.data, figure.layout || {}, config);
    } catch (error) {
      $figure.addClass('lodeon-visualization-error');
      $plot.text(
        error instanceof Error
          ? `lodeon.visualization.failed: ${error.message}`
          : 'lodeon.visualization.failed'
      );
    }
  });

  $('.lodeon-rawgraphs-source, .language-lodeon-rawgraphs, .language-text.highlight').each(function(index) {
    const $block = $(this);
    const source = $block.find('code').text();
    const title = findFenceTitle($block);
    const $figure = $('<figure class="lodeon-rawgraphs">');
    const $caption = $('<figcaption class="lodeon-visualization-title">');
    const $plot = $('<div class="lodeon-rawgraphs-plot">');
    const explicitRawGraphsFence =
      $block.hasClass('lodeon-rawgraphs-source') ||
      $block.hasClass('language-lodeon-rawgraphs');
    let spec = null;

    try {
      spec = JSON.parse(source);
    } catch (error) {
      if (!explicitRawGraphsFence) {
        return;
      }
    }

    if (!explicitRawGraphsFence && !isLodeonRawGraphsSpec(spec)) {
      return;
    }

    if (title) {
      $caption.text(title);
      $figure.append($caption);
    }

    $figure.append($plot);
    $block.replaceWith($figure);

    try {
      const svg = resolveRawGraphsSvg(spec);
      $plot.attr('id', `lodeon-rawgraphs-${index + 1}`);
      $plot.html(svg);
    } catch (error) {
      $figure.addClass('lodeon-visualization-error');
      $plot.text(
        error instanceof Error
          ? `lodeon.rawgraphs.failed: ${error.message}`
          : 'lodeon.rawgraphs.failed'
      );
    }
  });

  $('.lodeon-iiif-source, .language-lodeon-iiif, .language-text.highlight').each(function(index) {
    const $block = $(this);
    const source = $block.find('code').text();
    const title = findFenceTitle($block);
    const explicitIiifFence =
      $block.hasClass('lodeon-iiif-source') ||
      $block.hasClass('language-lodeon-iiif');
    let spec = null;

    try {
      spec = JSON.parse(source);
    } catch (error) {
      if (!explicitIiifFence) {
        return;
      }
    }

    if (!explicitIiifFence && !isLodeonIiifSpec(spec)) {
      return;
    }

    const $figure = $('<figure class="lodeon-iiif">');
    const $caption = $('<figcaption class="lodeon-visualization-title">');
    const $viewer = $('<div class="lodeon-iiif-viewer">');
    const $iiifCaption = $('<figcaption class="lodeon-iiif-caption">');
    const $status = $('<p class="lodeon-iiif-status">');

    if (title) {
      $caption.text(title);
      $figure.append($caption);
    }

    if (spec && typeof spec.caption === 'string' && spec.caption.trim()) {
      $iiifCaption.text(spec.caption.trim());
    } else {
      $iiifCaption.attr('hidden', 'hidden');
    }

    $figure.append($viewer, $iiifCaption, $status);
    $block.replaceWith($figure);
    renderLodeonIiifSpec(spec, $figure, $viewer, $status, index + 1);
  });

  $('.lodeon-graph-explorer').each(function(index) {
    const $figure = $(this);
    const $viewer = $figure.find('.lodeon-graph-explorer-viewer').first();
    const $status = $figure.find('.lodeon-graph-explorer-status').first();
    const spec = parseEmbeddedJson($figure.find('.lodeon-graph-explorer-spec').first().text());

    renderLodeonGraphExplorerSpec(spec, $figure, $viewer, $status, index + 1);
  });

  $('.lodeon-leaflet').not('.lodeon-leaflet-error').each(function(index) {
    const $figure = $(this);
    const $viewer = $figure.find('.lodeon-leaflet-viewer').first();
    const $status = $figure.find('.lodeon-leaflet-status').first();
    const spec = parseEmbeddedJson($figure.find('.lodeon-leaflet-spec').first().text());

    renderLodeonLeafletSpec(spec, $figure, $viewer, $status, index + 1);
  });

  $('.lodeon-embed-selector-item').on('click', function() {
    const $button = $(this);
    const nextUrl = String($button.attr('data-embed-url') || '').trim();
    const nextTitle = String($button.attr('data-embed-title') || '').trim();

    if (!nextUrl) {
      return;
    }

    const $figure = $button.closest('.lodeon-embed');
    const $iframe = $figure.find('.lodeon-embed-iframe').first();

    if (!$iframe.length) {
      return;
    }

    $iframe.attr('src', nextUrl);
    if (nextTitle) {
      $iframe.attr('title', nextTitle);
    }
    $figure.find('.lodeon-embed-selector-item').each(function() {
      const $item = $(this);
      const isActive = $item.is($button);

      $item.attr('data-active', String(isActive));
      $item.attr('aria-pressed', String(isActive));
    });
  });

  function findFenceTitle($block) {
    return findFenceAttribute($block, 'title') || '';
  }

  function findFenceAttribute($block, name) {
    const $container = $block.closest('.highlight');
    const value =
      $container.attr(name) ||
      $container.data(name) ||
      $block.attr(name) ||
      $block.data(name) ||
      $block.find('.code').first().attr(name) ||
      $block.find('.code').first().data(name) ||
      '';

    if (name === 'title' && !value) {
      return (
        $container.attr('title') ||
        $block.attr('title') ||
        $block.find('.filename').first().text()
      ).trim();
    }

    return String(value).trim();
  }

  function executeLodeonSparql($block, knowledgeGraphProfileId, query) {
    const $container = $('<div class="lodeon-sparql-result">');
    const $status = $('<p class="lodeon-sparql-status">').text('sparql.query.running');

    $container.append($status);
    $block.html($container);

    $.ajax({
      url: `/api/sparql/${encodeURIComponent(knowledgeGraphProfileId)}`,
      method: 'POST',
      data: query,
      processData: false,
      contentType: 'application/sparql-query',
      headers: {
        Accept: 'application/sparql-results+json'
      }
    }).done(function(result, _textStatus, jqXHR) {
      const contentType = jqXHR.getResponseHeader('content-type') || '';

      $container.empty();
      if (contentType.includes('json') && isSparqlSelectResult(result)) {
        renderLodeonSparqlTable($container, result);
        return;
      }
      if (contentType.includes('json') && typeof result === 'object') {
        $container.append($('<pre>').text(JSON.stringify(result, null, 2)));
        return;
      }
      $container.append($('<pre>').text(String(result || '')));
    }).fail(function(jqXHR) {
      const detail = readSparqlError(jqXHR);

      $container.empty().append(
        $('<p class="lodeon-sparql-error">').text(detail)
      );
    });
  }

  function isSparqlSelectResult(result) {
    return Boolean(
      result &&
      typeof result === 'object' &&
      result.head &&
      Array.isArray(result.head.vars) &&
      result.results &&
      Array.isArray(result.results.bindings)
    );
  }

  function renderLodeonSparqlTable($container, result) {
    const variables = result.head.vars || [];
    const bindings = result.results.bindings || [];
    const $table = $('<table>');
    const $thead = $('<thead>');
    const $tbody = $('<tbody>');

    $thead.append(
      $('<tr>').append(variables.map((variable) => $('<th>').text(variable)))
    );
    bindings.forEach((binding) => {
      $tbody.append(
        $('<tr>').append(
          variables.map((variable) => {
            const value = binding[variable];
            const text = value && typeof value.value === 'string' ? value.value : '';

            return $('<td>').text(text);
          })
        )
      );
    });
    $table.append($thead, $tbody);
    $container.append($table);

    if ($.fn.DataTable && !$.fn.DataTable.isDataTable($table[0])) {
      $table.DataTable({
        scrollX: false,
        paging: true,
        ordering: true,
        info: true
      });
    }
  }

  function readSparqlError(jqXHR) {
    const fallback = `SPARQL request failed with HTTP ${jqXHR.status}`;

    try {
      const parsed = JSON.parse(jqXHR.responseText || '{}');

      return parsed.detail || parsed.error || fallback;
    } catch (error) {
      return jqXHR.responseText || fallback;
    }
  }

  function resolvePlotlyFigure(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('lodeon.visualization.spec_invalid');
    }

    const figure = spec && typeof spec === 'object' ? spec.figure : null;

    if (figure && Array.isArray(figure.data)) {
      return {
        data: figure.data,
        layout: figure.layout || {},
        config: figure.config || {}
      };
    }

    return {
      data: parseJsonArray(spec.plotlyDataJson, 'plotlyDataJson'),
      layout: parseJsonObject(spec.layoutJson, 'layoutJson'),
      config: parseJsonObject(spec.configJson, 'configJson')
    };
  }

  function isLodeonVisualizationSpec(spec) {
    return Boolean(
      spec &&
      typeof spec === 'object' &&
      spec.renderer === 'plotly' &&
      (spec.figure || spec.plotlyDataJson)
    );
  }

  function isLodeonRawGraphsSpec(spec) {
    return Boolean(
      spec &&
      typeof spec === 'object' &&
      spec.renderer === 'rawgraphs' &&
      spec.svg
    );
  }

  function isLodeonIiifSpec(spec) {
    return Boolean(
      spec &&
      typeof spec === 'object' &&
      spec.renderer === 'iiif' &&
      (spec.url || spec.query || spec.selectedItem)
    );
  }

  function parseEmbeddedJson(source) {
    try {
      return JSON.parse(source || '{}');
    } catch (error) {
      return {};
    }
  }

  function renderLodeonLeafletSpec(spec, $figure, $viewer, $status, index) {
    const labels = spec && spec.labels && typeof spec.labels === 'object'
      ? spec.labels
      : {};
    let map = null;
    let resizeObserver = null;

    try {
      if (!window.L || typeof window.L.map !== 'function') {
        throw new Error('leaflet.viewer_initialization_failed');
      }
      if (!spec || spec.renderer !== 'leaflet' || !spec.featureCollection) {
        throw new Error('leaflet.geojson_invalid');
      }
      if (spec.clustering.enabled && typeof window.L.markerClusterGroup !== 'function') {
        throw new Error('leaflet.viewer_initialization_failed');
      }

      const viewer = $viewer[0];
      const height = Math.min(Math.max(Number(spec.height) || 520, 160), 1600);
      const mapId = `lodeon-leaflet-${index}`;
      $viewer.attr('id', mapId).css('height', `${height}px`);
      viewer.setAttribute('role', 'region');
      viewer.setAttribute('aria-label', String(labels.ariaLabel || ''));

      map = window.L.map(viewer, {
        zoomControl: true,
        attributionControl: true
      });
      window.L.tileLayer(spec.tileLayer.urlTemplate, {
        attribution: spec.tileLayer.attribution,
        minZoom: spec.tileLayer.minZoom,
        maxZoom: spec.tileLayer.maxZoom
      }).addTo(map);

      const featureLayer = window.L.layerGroup().addTo(map);
      const clusterLayer = spec.clustering.enabled
        ? window.L.markerClusterGroup({
            ...(spec.clustering.disableAtZoom == null
              ? {}
              : { disableClusteringAtZoom: spec.clustering.disableAtZoom }),
            showCoverageOnHover: spec.clustering.showCoverageOnHover,
            spiderfyOnMaxZoom: spec.clustering.spiderfyOnMaxZoom,
            ...(Number.isFinite(spec.clustering.spiderfyDistanceMultiplier)
              ? { spiderfyDistanceMultiplier: spec.clustering.spiderfyDistanceMultiplier }
              : {})
          }).addTo(map)
        : null;
      const categories = collectLeafletCategories(spec.featureCollection);
      const geoJsonLayer = window.L.geoJSON(spec.featureCollection, {
        style: (feature) => leafletFeatureStyle(feature, spec),
        pointToLayer: (feature, latLng) => createLeafletPointMarker(feature, latLng, spec),
        onEachFeature: (feature, layer) => {
          const popup = createLeafletPopup(feature, spec.popupFields);
          if (popup) {
            layer.bindPopup(popup, {
              autoPan: true,
              keepInView: true,
              maxWidth: 420,
              maxHeight: 320,
              className: 'lodeon-leaflet-popup-shell'
            });
          }
        }
      });

      geoJsonLayer.eachLayer((layer) => addLeafletRenderedLayer(
        layer,
        featureLayer,
        clusterLayer
      ));
      renderLeafletLegend(map, categories, spec);

      const bounds = geoJsonLayer.getBounds();
      if (spec.initialView === 'fitBounds' && bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [16, 16],
          maxZoom: spec.fitBoundsMaxZoom
        });
      } else {
        map.setView(spec.center || [0, 0], spec.zoom == null ? 2 : spec.zoom);
      }

      $status.text(
        spec.featureCollection.features.length
          ? String(labels.ready || '')
          : String(labels.empty || '')
      );
      $figure.attr('data-leaflet-ready', 'true');
      $figure[0].__lodeonLeafletMap = map;

      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
        resizeObserver.observe(viewer);
        $figure[0].__lodeonLeafletResizeObserver = resizeObserver;
      } else {
        $(window).on(`resize.lodeonLeaflet${index}`, () => map.invalidateSize({ pan: false }));
      }
      $(window).one(`pagehide.lodeonLeaflet${index}`, () => {
        resizeObserver?.disconnect();
        $(window).off(`resize.lodeonLeaflet${index}`);
        map.remove();
      });
      window.setTimeout(() => map.invalidateSize({ pan: false }), 0);
    } catch (error) {
      resizeObserver?.disconnect();
      map?.remove();
      $figure.addClass('lodeon-leaflet-error');
      const knownCodes = new Set([
        'leaflet.geojson_invalid',
        'leaflet.viewer_initialization_failed'
      ]);
      const candidate = error instanceof Error ? error.message : '';
      $figure.attr(
        'data-error-code',
        knownCodes.has(candidate) ? candidate : 'leaflet.viewer_initialization_failed'
      );
      $figure.attr('role', 'alert');
      $status.text(String(labels.unavailable || ''));
      $viewer.empty();
    }
  }

  function addLeafletRenderedLayer(layer, featureLayer, clusterLayer) {
    const isMarker = layer && typeof layer.getLatLng === 'function' &&
      typeof layer.setLatLng === 'function';
    if (clusterLayer && isMarker) {
      clusterLayer.addLayer(layer);
      return;
    }
    if (!isMarker && layer && typeof layer.eachLayer === 'function') {
      layer.eachLayer((child) => addLeafletRenderedLayer(child, featureLayer, clusterLayer));
      return;
    }
    featureLayer.addLayer(layer);
  }

  function createLeafletPointMarker(feature, latLng, spec) {
    const category = leafletFeatureCategory(feature);
    const color = leafletCategoryColor(category, spec.markerStyle.fillColor);
    const diameter = Math.max(spec.markerStyle.radius * 2, 8);
    const icon = window.L.divIcon({
      className: 'lodeon-leaflet-marker-icon',
      html: createLeafletMarkerElement(diameter, color, spec.markerStyle).outerHTML,
      iconSize: [diameter, diameter],
      iconAnchor: [diameter / 2, diameter / 2]
    });
    const accessibleLabel = leafletFeatureAccessibleLabel(feature, spec.labels.feature);
    return window.L.marker(latLng, {
      icon,
      keyboard: true,
      alt: accessibleLabel,
      title: accessibleLabel
    });
  }

  function createLeafletMarkerElement(diameter, fillColor, style) {
    const marker = document.createElement('span');
    marker.className = 'lodeon-leaflet-marker-shape';
    marker.style.width = `${Math.max(8, Math.round(diameter))}px`;
    marker.style.height = marker.style.width;
    marker.style.backgroundColor = safeLeafletCssColor(fillColor);
    marker.style.border = `${Math.max(0, style.weight)}px solid ${safeLeafletCssColor(style.color)}`;
    marker.style.opacity = String(Math.min(1, Math.max(0, style.fillOpacity)));
    return marker;
  }

  function leafletFeatureStyle(feature, spec) {
    return {
      color: safeLeafletCssColor(spec.markerStyle.color),
      fillColor: leafletCategoryColor(
        leafletFeatureCategory(feature),
        spec.markerStyle.fillColor
      ),
      fillOpacity: spec.markerStyle.fillOpacity,
      weight: spec.markerStyle.weight
    };
  }

  function createLeafletPopup(feature, configuredFields) {
    const properties = feature && feature.properties && typeof feature.properties === 'object'
      ? feature.properties
      : {};
    const fields = Array.isArray(configuredFields) && configuredFields.length
      ? configuredFields
      : Object.keys(properties);
    const available = fields.filter((field) => properties[field] != null);
    if (!available.length) {
      return null;
    }

    const popup = document.createElement('dl');
    popup.className = 'lodeon-leaflet-popup';
    available.forEach((field) => {
      const row = document.createElement('div');
      row.className = 'lodeon-leaflet-popup-row';
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      const value = formatLeafletPropertyValue(properties[field]);
      term.textContent = field;
      if (field === 'resource' && isSafeLeafletResourceUrl(value)) {
        const link = document.createElement('a');
        link.href = value;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = value;
        description.append(link);
      } else {
        description.textContent = value;
      }
      row.append(term, description);
      popup.append(row);
    });
    return popup;
  }

  function renderLeafletLegend(map, categories, spec) {
    if (!spec.legend.enabled || !categories.length) {
      return;
    }
    const positions = {
      topLeft: 'topleft',
      topRight: 'topright',
      bottomLeft: 'bottomleft',
      bottomRight: 'bottomright'
    };
    const control = window.L.control({ position: positions[spec.legend.position] });
    control.onAdd = () => {
      const legend = window.L.DomUtil.create('div', 'lodeon-leaflet-legend');
      window.L.DomEvent.disableClickPropagation(legend);
      legend.setAttribute('role', 'group');
      legend.setAttribute('aria-label', String(spec.labels.legend || ''));
      const title = String(spec.legend.title || spec.labels.legend || '').trim();
      if (title) {
        const heading = document.createElement('strong');
        heading.textContent = title;
        legend.append(heading);
      }
      const list = document.createElement('ul');
      categories.forEach((category) => {
        const item = document.createElement('li');
        const swatch = document.createElement('span');
        const label = document.createElement('span');
        swatch.className = 'lodeon-leaflet-legend-swatch';
        swatch.style.backgroundColor = leafletCategoryColor(category, spec.markerStyle.fillColor);
        label.textContent = category;
        item.append(swatch, label);
        list.append(item);
      });
      legend.append(list);
      return legend;
    };
    control.addTo(map);
  }

  function collectLeafletCategories(featureCollection) {
    return Array.from(new Set(featureCollection.features
      .map((feature) => leafletFeatureCategory(feature))
      .filter(Boolean)))
      .sort((left, right) => left.localeCompare(right));
  }

  function leafletFeatureCategory(feature) {
    const category = feature && feature.properties ? feature.properties.category : '';
    return typeof category === 'string' ? category.trim() : '';
  }

  function leafletFeatureAccessibleLabel(feature, fallback) {
    const properties = feature && feature.properties && typeof feature.properties === 'object'
      ? feature.properties
      : {};
    return ['label', 'category', 'resource']
      .map((key) => typeof properties[key] === 'string' ? properties[key].trim() : '')
      .find(Boolean) || String(fallback || '');
  }

  function leafletCategoryColor(category, fallback) {
    const colors = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#6A3D9A', '#666666'];
    if (!category) {
      return safeLeafletCssColor(fallback);
    }
    let hash = 0;
    Array.from(category).forEach((character) => {
      hash = (hash * 31 + character.codePointAt(0)) >>> 0;
    });
    return colors[hash % colors.length];
  }

  function safeLeafletCssColor(value) {
    return /^#[0-9a-f]{3,8}$/i.test(String(value)) || /^[a-z]+$/i.test(String(value))
      ? String(value)
      : 'transparent';
  }

  function formatLeafletPropertyValue(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch (error) {
      return '';
    }
  }

  function isSafeLeafletResourceUrl(value) {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch (error) {
      return false;
    }
  }

  async function renderLodeonGraphExplorerSpec(spec, $figure, $viewer, $status, index) {
    if (!spec || typeof spec !== 'object') {
      setGraphExplorerStatus($figure, $status, graphExplorerLabel(spec, 'unavailable'));
      return;
    }

    if (!window.d3) {
      setGraphExplorerStatus($figure, $status, graphExplorerLabel(spec, 'unavailable'));
      return;
    }

    $viewer.attr('id', `lodeon-graph-explorer-${index}`);
    $viewer.css('height', `${parseGraphExplorerHeight(spec.height, 520)}px`);

    let graph = normalizeGraphExplorerData(spec.graphData);
    const items = Array.isArray(spec.items) ? spec.items : [];
    const pendingExpansionIris = new Set();
    const viewer = createLodeonGraphExplorerViewer($viewer[0], graph, spec, async (node) => {
      if (!node || node.kind === 'literal') {
        return;
      }

      const iri = node.iri || node.id;
      if (!iri || !spec.profileId) {
        return;
      }
      if (pendingExpansionIris.has(iri)) {
        return;
      }

      pendingExpansionIris.add(iri);
      viewer.update(markGraphExplorerNodesLoading(viewer.getGraphData(), [iri], true));
      $status.text(graphExplorerLabel(spec, 'loading'));
      try {
        const nextGraph = await loadGraphExplorerExpansion(spec, [iri]);
        graph = markGraphExplorerNodesLoading(
          mergeGraphExplorerData(viewer.getGraphData(), nextGraph),
          [iri],
          false
        );
        viewer.update(graph);
        $status.text(graphExplorerSummary(spec, graph));
      } catch (error) {
        viewer.update(markGraphExplorerNodesLoading(viewer.getGraphData(), [iri], false));
        setGraphExplorerStatus($figure, $status, graphExplorerErrorMessage(error, spec));
      } finally {
        pendingExpansionIris.delete(iri);
      }
    });

    if (graph.nodes.length) {
      viewer.update(graph);
      $status.text(graphExplorerSummary(spec, graph));
      return;
    }

    const iris = items
      .map((item) => item && typeof item.iri === 'string' ? item.iri.trim() : '')
      .filter(Boolean);

    if (!iris.length || !spec.profileId) {
      setGraphExplorerStatus($figure, $status, graphExplorerLabel(spec, 'unavailable'));
      return;
    }

    $status.text(graphExplorerLabel(spec, 'loading'));
    try {
      graph = await loadGraphExplorerExpansion(spec, iris);
      viewer.update(graph);
      $status.text(graphExplorerSummary(spec, graph));
    } catch (error) {
      setGraphExplorerStatus($figure, $status, graphExplorerErrorMessage(error, spec));
    }
  }

  function createLodeonGraphExplorerViewer(host, graph, spec, onExpand) {
    const d3 = window.d3;
    const shell = $('<div class="lodeon-graph-viewer-shell">')[0];
    const toolbar = $('<div class="lodeon-graph-viewer-toolbar">')[0];
    const popover = $('<div class="lodeon-graph-node-popover" hidden>')[0];
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const width = Math.max(host.clientWidth || 960, 320);
    const height = parseGraphExplorerHeight(spec.height, 520);
    const colorway = Array.isArray(spec.colorway) && spec.colorway.length
      ? spec.colorway
      : ['#000000', '#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'];
    const singleTraceColor = spec.singleTraceColor || colorway[5] || colorway[0] || '#0072B2';
    const nodeColors = Object.assign({
      iri: singleTraceColor,
      blank: colorway[1] || '#E69F00',
      literal: '#FFFFFF'
    }, spec.colors && spec.colors.nodeColors ? spec.colors.nodeColors : {});
    const edgeColors = Object.assign({
      default: '#666666'
    }, spec.colors && spec.colors.edgeColors ? spec.colors.edgeColors : {});
    let showPredicateLabels = spec.showPredicateLabels !== false;
    let nodes = [];
    let edges = [];
    let warnings = [];
    let truncated = false;
    let popoverCloseTimer = null;

    host.innerHTML = '';
    svgElement.classList.add('lodeon-graph-viewer-svg');
    svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svgElement.setAttribute('width', '100%');
    svgElement.setAttribute('height', String(height));
    svgElement.style.minHeight = `${height}px`;
    shell.append(toolbar, popover, svgElement);
    host.append(shell);

    const svg = d3.select(svgElement);
    const group = svg.append('g').attr('class', 'lodeon-graph-viewer-canvas');
    const zoom = d3.zoom().scaleExtent([0.25, 5]).on('zoom', (event) => {
      group.attr('transform', event.transform);
    });
    const simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id((entry) => entry.id).distance(180))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(48));
    const markerId = `lodeon-graph-arrow-${Math.random().toString(36).slice(2)}`;

    svg.call(zoom).call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.78).translate(-width / 2, -height / 2)
    );
    svg
      .append('defs')
      .append('marker')
      .attr('id', markerId)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('markerWidth', 10)
      .attr('markerHeight', 10)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'currentColor');

    let link = group.selectAll('line');
    let linkLabels = group.selectAll('.lodeon-graph-viewer-link-label');
    let node = group.selectAll('.lodeon-graph-viewer-node');

    toolbar.append(
      createGraphExplorerButton(graphExplorerLabel(spec, 'zoomIn'), graphExplorerIcon('zoomIn'), () => {
        svg.transition().call(zoom.scaleBy, 1.2);
      }),
      createGraphExplorerButton(graphExplorerLabel(spec, 'zoomOut'), graphExplorerIcon('zoomOut'), () => {
        svg.transition().call(zoom.scaleBy, 0.8);
      }),
      createGraphExplorerButton(graphExplorerLabel(spec, 'resetZoom'), graphExplorerIcon('resetZoom'), () => {
        svg.transition().call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
      }),
      createGraphExplorerButton(graphExplorerLabel(spec, 'togglePredicateLabels'), graphExplorerIcon('labels'), () => {
        showPredicateLabels = !showPredicateLabels;
        linkLabels.style('display', showPredicateLabels ? 'block' : 'none');
      }),
      createGraphExplorerButton(graphExplorerLabel(spec, 'enterFullscreen'), graphExplorerIcon('enterFullscreen'), () => {
        toggleGraphExplorerFullscreen(shell, toolbar, spec);
      }, true)
    );
    document.addEventListener('fullscreenchange', () => {
      syncGraphExplorerFullscreenButton(shell, toolbar, spec);
    });
    popover.addEventListener('mouseenter', () => {
      if (popoverCloseTimer) {
        window.clearTimeout(popoverCloseTimer);
        popoverCloseTimer = null;
      }
    });
    popover.addEventListener('mouseleave', scheduleGraphExplorerPopoverClose);
    popover.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    simulation.on('tick', () => {
      link
        .attr('x1', (edge) => graphExplorerOffset(edge, 'source', 'x'))
        .attr('y1', (edge) => graphExplorerOffset(edge, 'source', 'y'))
        .attr('x2', (edge) => graphExplorerOffset(edge, 'target', 'x', true))
        .attr('y2', (edge) => graphExplorerOffset(edge, 'target', 'y', true));
      linkLabels
        .attr('x', (edge) => graphExplorerMidpoint(edge, 'x'))
        .attr('y', (edge) => graphExplorerMidpoint(edge, 'y'));
      node.attr('transform', (entry) => `translate(${entry.x || 0},${entry.y || 0})`);
    });

    function update(nextGraph) {
      const previousNodes = new Map(nodes.map((entry) => [entry.id, entry]));
      warnings = nextGraph.warnings || [];
      truncated = Boolean(nextGraph.truncated);
      nodes = (nextGraph.nodes || []).map((entry) => Object.assign({}, entry, {
        x: previousNodes.get(entry.id)?.x ?? entry.x,
        y: previousNodes.get(entry.id)?.y ?? entry.y,
        fx: previousNodes.get(entry.id)?.fx ?? entry.fx,
        fy: previousNodes.get(entry.id)?.fy ?? entry.fy
      }));
      edges = (nextGraph.edges || []).map((entry) => Object.assign({}, entry));
      link = link.data(edges, (entry) => entry.id).join(
        (enter) => enter.append('line').attr('class', 'lodeon-graph-viewer-link').attr('marker-end', `url(#${markerId})`),
        (update) => update,
        (exit) => exit.remove()
      ).style('stroke', (entry) => resolveGraphExplorerEdgeColor(entry, edgeColors));
      linkLabels = linkLabels.data(edges, (entry) => entry.id).join(
        (enter) => enter.append('text').attr('class', 'lodeon-graph-viewer-link-label').attr('text-anchor', 'middle').attr('dy', -5),
        (update) => update,
        (exit) => exit.remove()
      ).style('display', showPredicateLabels ? 'block' : 'none').text((edge) => graphExplorerCompact(edge.label || edge.predicate, 40));
      node = node.data(nodes, (entry) => entry.id).join(
        (enter) => renderGraphExplorerNodeEnter(enter),
        (update) => update,
        (exit) => exit.remove()
      );
      syncGraphExplorerNodePresentation(node);
      simulation.nodes(nodes);
      simulation.force('link').links(edges);
      simulation.alpha(0.65).restart();
    }

    function renderGraphExplorerNodeEnter(enter) {
      const nodeGroup = enter.append('g').call(
        d3.drag()
          .on('start', (event, entry) => {
            if (!event.active) {
              simulation.alphaTarget(0.3).restart();
            }
            entry.fx = entry.x;
            entry.fy = entry.y;
          })
          .on('drag', (event, entry) => {
            entry.fx = event.x;
            entry.fy = event.y;
          })
          .on('end', (event, entry) => {
            if (!event.active) {
              simulation.alphaTarget(0);
            }
            entry.fx = entry.x;
            entry.fy = entry.y;
          })
      );
      nodeGroup.append('circle');
      nodeGroup.append('text').attr('class', 'lodeon-graph-viewer-node-label').attr('text-anchor', 'middle');
      nodeGroup
        .on('mouseenter', (event, entry) => {
          showGraphExplorerNodePopover(entry, event);
        })
        .on('mouseleave', scheduleGraphExplorerPopoverClose);
      nodeGroup.on('click', (event, entry) => {
        event.stopPropagation();
        if (entry.loading) {
          return;
        }
        onExpand(entry);
      });
      return nodeGroup;
    }

    function syncGraphExplorerNodePresentation(selection) {
      selection.attr('class', (entry) => [
        'lodeon-graph-viewer-node',
        entry.start ? 'lodeon-graph-viewer-node-start' : '',
        entry.kind === 'literal' ? 'lodeon-graph-viewer-node-literal' : '',
        entry.kind === 'blank' ? 'lodeon-graph-viewer-node-blank' : '',
        entry.fx !== undefined && entry.fx !== null ? 'lodeon-graph-viewer-node-fixed' : '',
        entry.loading ? 'lodeon-graph-viewer-node-loading' : ''
      ].filter(Boolean).join(' '));
      selection.select('circle')
        .attr('r', (entry) => entry.kind === 'literal' ? 22 : 30)
        .attr('fill', (entry) => resolveGraphExplorerNodeColor(entry, nodeColors));
      selection.select('text')
        .attr('dy', (entry) => entry.kind === 'literal' ? 38 : 47)
        .text((entry) => graphExplorerCompact(entry.label || entry.id, 34));
    }

    function showGraphExplorerNodePopover(entry, event) {
      if (popoverCloseTimer) {
        window.clearTimeout(popoverCloseTimer);
        popoverCloseTimer = null;
      }
      if (!renderGraphExplorerNodePopover(entry)) {
        popover.hidden = true;
        return;
      }
      positionGraphExplorerPopover(event);
      popover.hidden = false;
    }

    function scheduleGraphExplorerPopoverClose() {
      if (popoverCloseTimer) {
        window.clearTimeout(popoverCloseTimer);
      }
      popoverCloseTimer = window.setTimeout(() => {
        popover.hidden = true;
      }, 350);
    }

    function positionGraphExplorerPopover(event) {
      const shellRect = shell.getBoundingClientRect();
      const popoverWidth = popover.offsetWidth || 280;
      const popoverHeight = popover.offsetHeight || 120;
      const padding = 12;
      const rawLeft = event.clientX - shellRect.left + padding;
      const rawTop = event.clientY - shellRect.top + padding;
      const left = Math.min(Math.max(padding, rawLeft), Math.max(padding, shellRect.width - popoverWidth - padding));
      const top = Math.min(Math.max(padding, rawTop), Math.max(padding, shellRect.height - popoverHeight - padding));

      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    }

    function renderGraphExplorerNodePopover(entry) {
      popover.innerHTML = '';
      const list = document.createElement('dl');
      let rowCount = 0;

      list.className = 'lodeon-graph-node-popover-list';
      if (entry.hasLabel) {
        appendGraphExplorerPopoverRow(list, graphExplorerLabel(spec, 'popupLabel'), entry.label || entry.id);
        rowCount += 1;
      }
      if (entry.kind === 'iri') {
        appendGraphExplorerPopoverRow(list, graphExplorerLabel(spec, 'popupResource'), entry.iri || entry.id, entry.iri || entry.id);
        rowCount += 1;
      }
      if (entry.type) {
        appendGraphExplorerPopoverRow(list, graphExplorerLabel(spec, 'popupType'), entry.typeLabel || graphExplorerCompact(entry.type, 52), entry.type);
        rowCount += 1;
      }
      (entry.properties || []).forEach((property) => {
        appendGraphExplorerPopoverRow(list, property.label, property.value, property.link ? property.iri || property.value : '');
        rowCount += 1;
      });
      popover.append(list);
      return rowCount > 0;
    }

    update(normalizeGraphExplorerData(graph));

    return {
      update,
      getGraphData: () => ({
        nodes: nodes.map((entry) => Object.assign({}, entry)),
        edges: edges.map((edge) => Object.assign({}, edge, {
          source: graphExplorerNodeId(edge.source),
          target: graphExplorerNodeId(edge.target)
        })),
        warnings,
        truncated
      })
    };
  }

  async function loadGraphExplorerExpansion(spec, iris) {
    const response = await fetch(`/api/explorer/${encodeURIComponent(spec.profileId)}/expand`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        iris,
        direction: spec.direction || 'both',
        depth: spec.depth || 1,
        maxNodes: spec.maxNodes || 100,
        maxEdgesPerNode: spec.maxEdgesPerNode || 50,
        includeLiterals: Boolean(spec.includeLiterals),
        includeBlankNodes: Boolean(spec.includeBlankNodes)
      })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || body.ok === false) {
      throw new Error(body.detail || body.code || String(response.status));
    }

    return normalizeGraphExplorerData(body);
  }

  function normalizeGraphExplorerData(value) {
    return {
      nodes: value && Array.isArray(value.nodes) ? value.nodes : [],
      edges: value && Array.isArray(value.edges) ? value.edges : [],
      warnings: value && Array.isArray(value.warnings) ? value.warnings : [],
      truncated: Boolean(value && value.truncated)
    };
  }

  function mergeGraphExplorerData(existing, incoming) {
    const nodes = new Map((existing.nodes || []).map((entry) => [entry.id, entry]));
    const edges = new Map((existing.edges || []).map((entry) => [entry.id, entry]));

    (incoming.nodes || []).forEach((entry) => {
      const previous = nodes.get(entry.id) || {};
      nodes.set(entry.id, Object.assign({}, previous, entry, {
        start: Boolean(previous.start) || Boolean(entry.start)
      }));
    });
    (incoming.edges || []).forEach((entry) => {
      edges.set(entry.id, entry);
    });

    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
      warnings: [].concat(existing.warnings || [], incoming.warnings || []),
      truncated: Boolean(existing.truncated) || Boolean(incoming.truncated)
    };
  }

  function markGraphExplorerNodesLoading(graph, iris, loading) {
    const loadingIris = new Set(iris || []);

    return {
      nodes: (graph.nodes || []).map((entry) =>
        loadingIris.has(entry.iri || entry.id)
          ? Object.assign({}, entry, { loading })
          : entry
      ),
      edges: graph.edges || [],
      warnings: graph.warnings || [],
      truncated: Boolean(graph.truncated)
    };
  }

  function graphExplorerOffset(edge, side, axis, reverse) {
    const source = graphExplorerNodeObject(edge.source);
    const target = graphExplorerNodeObject(edge.target);
    const angle = Math.atan2((target.y || 0) - (source.y || 0), (target.x || 0) - (source.x || 0));
    const current = side === 'source' ? source : target;
    const offset = (current.kind === 'literal' ? 22 : 30) + (reverse ? 10 : 0);
    const direction = side === 'source' ? 1 : -1;

    if (axis === 'x') {
      return (current.x || 0) + Math.cos(angle) * offset * direction;
    }

    return (current.y || 0) + Math.sin(angle) * offset * direction;
  }

  function graphExplorerMidpoint(edge, axis) {
    const source = graphExplorerNodeObject(edge.source);
    const target = graphExplorerNodeObject(edge.target);

    return ((source[axis] || 0) + (target[axis] || 0)) / 2;
  }

  function graphExplorerNodeObject(value) {
    if (!value) {
      return { id: '' };
    }

    return typeof value === 'string' ? { id: value } : value;
  }

  function graphExplorerNodeId(value) {
    if (!value) {
      return '';
    }

    return typeof value === 'string' ? value : value.id;
  }

  function resolveGraphExplorerNodeColor(node, nodeColors) {
    if (node.type && nodeColors[node.type]) {
      return nodeColors[node.type];
    }

    return nodeColors[node.kind || 'iri'] || nodeColors.iri || '#0072B2';
  }

  function resolveGraphExplorerEdgeColor(edge, edgeColors) {
    if (edge.predicate && edgeColors[edge.predicate]) {
      return edgeColors[edge.predicate];
    }
    if (edge.direction && edgeColors[edge.direction]) {
      return edgeColors[edge.direction];
    }
    return edgeColors.default || '#666666';
  }

  function parseGraphExplorerHeight(value, fallback) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(parsed, 160), 1600);
  }

  function graphExplorerCompact(value, maxLength) {
    const text = String(value || '');

    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
  }

  function graphExplorerLabel(spec, key) {
    const labels = spec && typeof spec === 'object' ? spec.labels || {} : {};

    return String(labels[key] || `graphExplorer.${key}`);
  }

  function graphExplorerSummary(spec, graph) {
    const nodes = (graph.nodes || []).length;
    const edges = (graph.edges || []).length;

    return graphExplorerLabel(spec, 'summary')
      .replace('{nodes}', String(nodes))
      .replace('{edges}', String(edges));
  }

  function graphExplorerErrorMessage(error, spec) {
    const message = error instanceof Error ? error.message : '';

    return message
      ? `${graphExplorerLabel(spec, 'unavailable')}: ${message}`
      : graphExplorerLabel(spec, 'unavailable');
  }

  function setGraphExplorerStatus($figure, $status, message) {
    $figure.addClass('lodeon-graph-explorer-error');
    $status.text(message);
  }

  function createGraphExplorerButton(label, icon, onClick, fullscreen) {
    const button = $('<button type="button" class="lodeon-graph-viewer-control">')
      .attr('title', label)
      .attr('aria-label', label)
      .html(icon)
      .on('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      })[0];

    if (fullscreen) {
      button.dataset.graphExplorerFullscreen = 'true';
    }

    return button;
  }

  function appendGraphExplorerPopoverRow(list, label, value, href) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');

    term.textContent = label;
    if (href && /^(https?:|urn:)/.test(href)) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = value;
      description.append(link);
    } else {
      description.textContent = value;
    }
    list.append(term, description);
  }

  function toggleGraphExplorerFullscreen(shell, toolbar, spec) {
    if (document.fullscreenElement === shell) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      shell.dataset.fullscreen = 'false';
      syncGraphExplorerFullscreenButton(shell, toolbar, spec);
      return;
    }

    if (shell.requestFullscreen) {
      shell.requestFullscreen();
      shell.dataset.fullscreen = 'true';
      syncGraphExplorerFullscreenButton(shell, toolbar, spec);
      return;
    }

    shell.dataset.fullscreen = shell.dataset.fullscreen === 'true' ? 'false' : 'true';
    syncGraphExplorerFullscreenButton(shell, toolbar, spec);
  }

  function syncGraphExplorerFullscreenButton(shell, toolbar, spec) {
    const isFullscreen = document.fullscreenElement === shell || shell.dataset.fullscreen === 'true';
    const button = toolbar.querySelector('[data-graph-explorer-fullscreen="true"]');

    if (!button) {
      return;
    }

    const label = isFullscreen
      ? graphExplorerLabel(spec, 'exitFullscreen')
      : graphExplorerLabel(spec, 'enterFullscreen');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = graphExplorerIcon(isFullscreen ? 'exitFullscreen' : 'enterFullscreen');
  }

  function graphExplorerIcon(name) {
    const paths = {
      zoomIn: '<circle cx="10" cy="10" r="5"/><path d="M10 7v6M7 10h6M14 14l5 5"/>',
      zoomOut: '<circle cx="10" cy="10" r="5"/><path d="M7 10h6M14 14l5 5"/>',
      resetZoom: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/>',
      labels: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/>',
      enterFullscreen: '<path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M21 16v5h-5"/><path d="M8 21H3v-5"/>',
      exitFullscreen: '<path d="M9 3v6H3"/><path d="M15 3v6h6"/><path d="M21 15h-6v6"/><path d="M3 15h6v6"/>'
    };

    return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.resetZoom}</g></svg>`;
  }

  async function renderLodeonIiifSpec(spec, $figure, $viewer, $status, index) {
    try {
      if (!spec || typeof spec !== 'object') {
        throw new Error('lodeon.iiif.spec_invalid');
      }

      $viewer.attr('id', `lodeon-iiif-${index}`);
      $viewer.css('height', `${parseIiifHeight(spec.height, 520)}px`);
      $status.text('iiif.resource.loading');

      const items = await resolveIiifItems(spec);

      if (!items.length) {
        throw new Error('lodeon.iiif.url_missing');
      }

      const resources = await loadIiifResourcesForItems(items, spec);

      if (!resources.length) {
        throw new Error('lodeon.iiif.image_service_missing');
      }

      const viewMode = spec.viewMode === 'gallery' ? 'gallery' : 'single';
      const selectedUrl =
        spec.selectedItem && typeof spec.selectedItem.url === 'string'
          ? spec.selectedItem.url
          : '';
      const selectedResource =
        viewMode === 'single' && selectedUrl
          ? resources.find((resource) => resource.sourceUrl === selectedUrl) || resources[0]
          : resources[0];
      const tileSources =
        viewMode === 'gallery'
          ? resources.map((resource) => resource.tileSource)
          : selectedResource.tileSource;

      if (!window.OpenSeadragon) {
        renderIiifFallback($figure, $viewer, resources, 'openseadragon.unavailable');
        $status.text('iiif.fallback_links.rendered');
        return;
      }

      window.OpenSeadragon({
        element: $viewer[0],
        tileSources,
        drawer: ['canvas', 'html'],
        autoHideControls: false,
        showNavigator: false,
        showNavigationControl: true,
        prefixUrl: '',
        navImages: createOpenSeadragonNavImages(),
        sequenceMode: viewMode === 'gallery',
        showSequenceControl: viewMode === 'gallery',
        showReferenceStrip:
          viewMode === 'gallery' && spec.galleryReferenceStrip !== 'none',
        referenceStripScroll:
          spec.galleryReferenceStrip === 'vertical' ? 'vertical' : 'horizontal',
        referenceStripPosition:
          spec.galleryReferenceStrip === 'vertical' ? 'TOP_LEFT' : 'BOTTOM_LEFT',
        gestureSettingsMouse: {
          clickToZoom: true,
          dblClickToZoom: true,
          scrollToZoom: true
        }
      });

      $status.text(
        viewMode === 'gallery'
          ? `${resources.length} iiif.images.loaded`
          : `iiif.image.loaded: ${selectedResource.label || selectedResource.sourceUrl}`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'iiif.render_failed';

      $figure.addClass('lodeon-visualization-error');
      $viewer.text(`lodeon.iiif.render_failed: ${message}`);
      $status.empty();
    }
  }

  function createOpenSeadragonNavImages() {
    return {
      zoomIn: createOpenSeadragonButtonImage('zoomIn'),
      zoomOut: createOpenSeadragonButtonImage('zoomOut'),
      home: createOpenSeadragonButtonImage('home'),
      fullpage: createOpenSeadragonButtonImage('fullpage'),
      rotateleft: createOpenSeadragonButtonImage('rotateleft'),
      rotateright: createOpenSeadragonButtonImage('rotateright'),
      flip: createOpenSeadragonButtonImage('flip'),
      previous: createOpenSeadragonButtonImage('previous'),
      next: createOpenSeadragonButtonImage('next')
    };
  }

  function createOpenSeadragonButtonImage(icon) {
    return {
      REST: createOpenSeadragonButtonDataUrl(icon, '#ffffff', '#2f3742', '#111827'),
      GROUP: createOpenSeadragonButtonDataUrl(icon, '#f7f8fa', '#2f3742', '#111827'),
      HOVER: createOpenSeadragonButtonDataUrl(icon, '#eef6ff', '#0072B2', '#0f172a'),
      DOWN: createOpenSeadragonButtonDataUrl(icon, '#dbeafe', '#0072B2', '#0f172a')
    };
  }

  function createOpenSeadragonButtonDataUrl(icon, fill, border, stroke) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
      `<rect x="1" y="1" width="30" height="30" rx="5" fill="${fill}" fill-opacity=".96" stroke="${border}" stroke-width="1.4"/>` +
      `<g fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${openSeadragonIconPath(icon)}</g>` +
      `</svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function openSeadragonIconPath(icon) {
    const paths = {
      zoomIn: '<circle cx="14" cy="14" r="6"/><path d="M14 11v6M11 14h6M19 19l5 5"/>',
      zoomOut: '<circle cx="14" cy="14" r="6"/><path d="M11 14h6M19 19l5 5"/>',
      home: '<path d="M8 16l8-7 8 7"/><path d="M10 15v9h12v-9"/><path d="M14 24v-5h4v5"/>',
      fullpage: '<path d="M10 14v-4h4"/><path d="M22 14v-4h-4"/><path d="M10 18v4h4"/><path d="M22 18v4h-4"/>',
      rotateleft: '<path d="M10 12h7a6 6 0 1 1-4.2 10.2"/><path d="M10 12l4-4M10 12l4 4"/>',
      rotateright: '<path d="M22 12h-7a6 6 0 1 0 4.2 10.2"/><path d="M22 12l-4-4M22 12l-4 4"/>',
      flip: '<path d="M16 7v18"/><path d="M7 10l6 6-6 6z"/><path d="M25 10l-6 6 6 6z"/>',
      previous: '<path d="M20 8l-8 8 8 8"/>',
      next: '<path d="M12 8l8 8-8 8"/>'
    };

    return paths[icon] || paths.home;
  }

  async function resolveIiifItems(spec) {
    if (spec.sourceMode === 'sparql') {
      if (spec.result && spec.result.status === 'success') {
        return extractIiifItemsFromNormalizedResult(spec.result, spec.resultMapping || {});
      }

      if (typeof spec.query === 'string' && spec.query.trim() && spec.knowledgeGraphProfileId) {
        const result = await executeIiifSparql(spec.knowledgeGraphProfileId, spec.query);

        return extractIiifItemsFromSparqlJson(result, spec.resultMapping || {});
      }
    }

    return extractDirectIiifItems(spec.url || '');
  }

  function extractDirectIiifItems(value) {
    return String(value || '')
      .split(/\r?\n/u)
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url, index) => ({
        url,
        label: url,
        resource: '',
        rowIndex: index
      }));
  }

  function extractIiifItemsFromNormalizedResult(result, mapping) {
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const manifestKey = mapping.manifest || 'manifestUrl';
    const imageInfoKey = mapping.imageInfo || 'imageInfoUrl';
    const labelKey = mapping.label || 'label';
    const resourceKey = mapping.resource || 'item';

    return rows.flatMap((row, index) => {
      const manifestUrl = normalizedBindingValue(row, manifestKey);
      const imageInfoUrl = normalizedBindingValue(row, imageInfoKey);
      const url = manifestUrl || imageInfoUrl;

      if (!url) {
        return [];
      }

      return [{
        url,
        label:
          normalizedBindingValue(row, labelKey) ||
          normalizedBindingValue(row, resourceKey) ||
          url,
        resource: normalizedBindingValue(row, resourceKey),
        rowIndex: index
      }];
    });
  }

  function extractIiifItemsFromSparqlJson(result, mapping) {
    const bindings =
      result && result.results && Array.isArray(result.results.bindings)
        ? result.results.bindings
        : [];
    const manifestKey = mapping.manifest || 'manifestUrl';
    const imageInfoKey = mapping.imageInfo || 'imageInfoUrl';
    const labelKey = mapping.label || 'label';
    const resourceKey = mapping.resource || 'item';

    return bindings.flatMap((row, index) => {
      const manifestUrl = sparqlBindingValue(row, manifestKey);
      const imageInfoUrl = sparqlBindingValue(row, imageInfoKey);
      const url = manifestUrl || imageInfoUrl;

      if (!url) {
        return [];
      }

      return [{
        url,
        label:
          sparqlBindingValue(row, labelKey) ||
          sparqlBindingValue(row, resourceKey) ||
          url,
        resource: sparqlBindingValue(row, resourceKey),
        rowIndex: index
      }];
    });
  }

  function normalizedBindingValue(row, key) {
    const value = row && row[key];

    if (value && typeof value.value === 'string') {
      return value.value;
    }

    return typeof value === 'string' ? value : '';
  }

  function sparqlBindingValue(row, key) {
    const value = row && row[key];

    return value && typeof value.value === 'string' ? value.value : '';
  }

  function executeIiifSparql(profileId, query) {
    return $.ajax({
      url: `/api/sparql/${encodeURIComponent(profileId)}`,
      method: 'POST',
      data: query,
      processData: false,
      contentType: 'application/sparql-query',
      headers: {
        Accept: 'application/sparql-results+json'
      }
    });
  }

  async function loadIiifResourcesForItems(items, spec) {
    const nested = await Promise.all(
      items.map(async (item) => {
        const payload = await fetchIiifJson(item.url);
        const resources = parseIiifResources(payload, item.url);

        return resources.map((resource) => ({
          ...resource,
          sourceUrl: item.url,
          label: resource.label || item.label,
          resource: item.resource
        }));
      })
    );

    const resources = nested.flat();

    if (spec.viewMode !== 'gallery') {
      const selectedUrl =
        spec.selectedItem && typeof spec.selectedItem.url === 'string'
          ? spec.selectedItem.url
          : '';

      if (selectedUrl) {
        return resources.filter((resource) => resource.sourceUrl === selectedUrl).slice(0, 1);
      }

      return resources.slice(0, 1);
    }

    return resources;
  }

  async function fetchIiifJson(url) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json, application/ld+json;q=0.9, */*;q=0.1'
      }
    });

    if (!response.ok) {
      throw new Error(`IIIF request failed (${response.status}) for ${url}`);
    }

    return response.json();
  }

  function parseIiifResources(payload, sourceUrl) {
    if (isIiifImageApiInfo(payload)) {
      return [parseIiifImageApiInfo(payload, sourceUrl)];
    }

    return parseIiifManifestResources(payload, sourceUrl);
  }

  function isIiifImageApiInfo(payload) {
    const context = String(payload && (payload['@context'] || payload.context || ''));
    const type = String(payload && (payload.type || payload['@type'] || ''));

    return (
      context.includes('/api/image/') ||
      type.includes('ImageService') ||
      Boolean(payload && payload.protocol === 'http://iiif.io/api/image')
    );
  }

  function parseIiifImageApiInfo(payload, sourceUrl) {
    return {
      tileSource: sourceUrl,
      label: sourceUrl,
      width: Number(payload.width || 0),
      height: Number(payload.height || 0)
    };
  }

  function parseIiifManifestResources(payload, sourceUrl) {
    const canvases = Array.isArray(payload && payload.items)
      ? payload.items
      : Array.isArray(payload && payload.sequences && payload.sequences[0] && payload.sequences[0].canvases)
        ? payload.sequences[0].canvases
        : [];

    return canvases.flatMap((canvas, index) => {
      const serviceUrl = findIiifImageServiceUrl(canvas);

      if (!serviceUrl) {
        return [];
      }

      return [{
        tileSource: serviceUrl.endsWith('/info.json') ? serviceUrl : `${serviceUrl.replace(/\/$/u, '')}/info.json`,
        label: manifestLabel(canvas.label) || manifestLabel(payload.label) || sourceUrl,
        width: Number(canvas.width || 0),
        height: Number(canvas.height || 0),
        sourceUrl,
        rowIndex: index
      }];
    });
  }

  function findIiifImageServiceUrl(canvas) {
    const annotationPage =
      Array.isArray(canvas && canvas.items) && canvas.items.length
        ? canvas.items[0]
        : null;
    const annotation =
      annotationPage && Array.isArray(annotationPage.items) && annotationPage.items.length
        ? annotationPage.items[0]
        : null;
    const body = annotation && annotation.body ? annotation.body : null;
    const services = []
      .concat(body && body.service ? body.service : [])
      .concat(body && body.services ? body.services : []);

    if (services.length) {
      return serviceId(services[0]);
    }

    const images = Array.isArray(canvas && canvas.images) ? canvas.images : [];
    const imageResource = images[0] && images[0].resource ? images[0].resource : null;
    const legacyServices = []
      .concat(imageResource && imageResource.service ? imageResource.service : [])
      .concat(imageResource && imageResource.services ? imageResource.services : []);

    return legacyServices.length ? serviceId(legacyServices[0]) : '';
  }

  function serviceId(service) {
    if (!service || typeof service !== 'object') {
      return '';
    }

    return String(service.id || service['@id'] || '').trim();
  }

  function manifestLabel(value) {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object') {
      const none = value.none;
      const en = value.en;

      if (Array.isArray(none) && none.length) {
        return String(none[0]);
      }
      if (Array.isArray(en) && en.length) {
        return String(en[0]);
      }
    }

    return '';
  }

  function renderIiifFallback($figure, $viewer, resources, reason) {
    $figure.addClass('lodeon-iiif-fallback');
    $viewer.empty().append($('<p>').text(reason));
    const $list = $('<ul>');

    resources.forEach((resource) => {
      $list.append(
        $('<li>').append(
          $('<a>')
            .attr('href', resource.tileSource)
            .attr('target', '_blank')
            .attr('rel', 'noopener noreferrer')
            .text(resource.label || resource.tileSource)
        )
      );
    });
    $viewer.append($list);
  }

  function parseIiifHeight(value, fallback) {
    const height = Number.parseInt(value, 10);

    if (!Number.isFinite(height)) {
      return fallback;
    }

    return Math.min(Math.max(height, 160), 1600);
  }

  function resolveRawGraphsSvg(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('lodeon.rawgraphs.spec_invalid');
    }

    if (typeof spec.svg !== 'string' || !spec.svg.trim()) {
      throw new Error('lodeon.rawgraphs.svg_missing');
    }

    return spec.svg;
  }

  function parseJsonArray(source, label) {
    const parsed = parseJson(source, label);

    if (!Array.isArray(parsed)) {
      throw new Error(`${label} must contain a JSON array.`);
    }

    return parsed;
  }

  function parseJsonObject(source, label) {
    const parsed = parseJson(source, label);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} must contain a JSON object.`);
    }

    return parsed;
  }

  function parseJson(source, label) {
    if (typeof source !== 'string' || !source.trim()) {
      throw new Error(`${label} is empty.`);
    }

    try {
      return JSON.parse(source);
    } catch (error) {
      throw new Error(`${label} is not valid JSON.`);
    }
  }

});
