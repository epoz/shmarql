import type { VerovioItem } from "@lodeon/nodes/verovio/contracts";

export const VEROVIO_DIRECT_MEI = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <music><body><mdiv><score>
  <scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
  <section><measure n="1" xml:id="measure-1">
    <staff n="1"><layer n="1"><note pname="c" oct="4" dur="4" xml:id="note-1"/></layer></staff>
  </measure></section></score></mdiv></body></music>
</mei>`;

export const VEROVIO_DIRECT_PAE = `@clef:G-2
@keysig:xF
@timesig:3/4
@data:8.6{''DG}{D'B}''q6D{8C6'BA}/`;

export const VEROVIO_MULTI_PAGE_MEI = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <music><body><mdiv><score>
    <scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
    <section>
    <measure n="1" xml:id="page-measure-1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="1"/></layer></staff></measure>
    <pb/>
    <measure n="2" xml:id="page-measure-2"><staff n="1"><layer n="1"><note pname="d" oct="4" dur="1"/></layer></staff></measure>
  </section></score></mdiv></body></music>
</mei>`;

export const VEROVIO_FILE_FIXTURE = {
  name: "incipit.pae",
  format: "pae",
  data: VEROVIO_DIRECT_PAE
} as const;

const ready = { state: "ready", messages: [] } as const;

export const VEROVIO_MULTI_ITEM_FIXTURE: VerovioItem[] = [
  {
    id: "item-a-1",
    data: VEROVIO_DIRECT_PAE,
    format: "pae",
    label: "First notation",
    resource: "https://example.org/resource/a",
    resourceLabel: "Resource A",
    bindings: {
      data: { type: "literal", value: VEROVIO_DIRECT_PAE },
      format: { type: "literal", value: "pae" },
      label: { type: "literal", value: "First notation" },
      resource: { type: "uri", value: "https://example.org/resource/a" },
      resourceLabel: { type: "literal", value: "Resource A" },
      category: { type: "literal", value: "alpha" }
    },
    status: ready
  },
  {
    id: "item-a-2",
    data: VEROVIO_DIRECT_MEI,
    format: "mei",
    label: "Second notation",
    resource: "https://example.org/resource/a",
    resourceLabel: "Resource A",
    bindings: {
      data: { type: "literal", value: VEROVIO_DIRECT_MEI },
      label: { type: "literal", value: "Second notation" },
      resource: { type: "uri", value: "https://example.org/resource/a" },
      category: { type: "literal", value: "beta" }
    },
    status: ready
  },
  {
    id: "item-ungrouped-1",
    data: VEROVIO_DIRECT_PAE,
    format: null,
    label: null,
    resource: null,
    resourceLabel: null,
    bindings: {
      data: { type: "literal", value: VEROVIO_DIRECT_PAE },
      note: { type: "literal", value: "optional fixed bindings absent" }
    },
    status: ready
  },
  {
    id: "item-b-1",
    data: VEROVIO_MULTI_PAGE_MEI,
    format: "mei",
    label: "Multi-page notation",
    resource: "https://example.org/resource/b",
    resourceLabel: null,
    bindings: {
      data: { type: "literal", value: VEROVIO_MULTI_PAGE_MEI },
      format: { type: "literal", value: "mei" },
      label: { type: "literal", value: "Multi-page notation" },
      resource: { type: "uri", value: "https://example.org/resource/b" }
    },
    status: ready
  },
  {
    id: "item-duplicate-1",
    data: VEROVIO_DIRECT_PAE,
    format: "pae",
    label: "First notation",
    resource: "https://example.org/resource/a",
    resourceLabel: "Resource A",
    bindings: {
      data: { type: "literal", value: VEROVIO_DIRECT_PAE },
      format: { type: "literal", value: "pae" },
      label: { type: "literal", value: "First notation" },
      resource: { type: "uri", value: "https://example.org/resource/a" },
      resourceLabel: { type: "literal", value: "Resource A" },
      category: { type: "literal", value: "alpha" }
    },
    status: ready
  },
  {
    id: "item-warning",
    data: VEROVIO_DIRECT_PAE,
    format: "pae",
    label: "Notation with warning",
    resource: null,
    resourceLabel: null,
    bindings: {
      data: { type: "literal", value: VEROVIO_DIRECT_PAE },
      label: { type: "literal", value: "Notation with warning" }
    },
    status: {
      state: "warning",
      messages: [
        {
          code: "verovio.pae_warning",
          severity: "warning",
          variables: { externalCode: 12 },
          location: { field: "data", row: 1, column: 8 }
        }
      ]
    }
  },
  {
    id: "item-error",
    data: "<mei>",
    format: "mei",
    label: "Invalid notation",
    resource: "https://example.org/resource/c",
    resourceLabel: "Resource C",
    bindings: {
      data: { type: "literal", value: "<mei>" },
      format: { type: "literal", value: "mei" },
      label: { type: "literal", value: "Invalid notation" },
      resource: { type: "uri", value: "https://example.org/resource/c" }
    },
    status: {
      state: "error",
      messages: [
        {
          code: "verovio.input_invalid",
          severity: "error",
          variables: { format: "mei" }
        }
      ]
    }
  }
];

export const VEROVIO_COMPARE_FIXTURE = {
  aItemId: "item-a-1",
  bItemId: "item-b-1"
} as const;
