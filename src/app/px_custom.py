from shapely import wkt, geometry
from shapely.geometry import shape, Point, Polygon, LineString, MultiPoint, MultiPolygon
from geopy.distance import geodesic
from pyoxigraph import Literal, NamedNode
from pyproj import Geod
import json
import math
from fuzzywuzzy import fuzz

# /geo

def px_distance(t1, t2):
    try:
        geom1 = parse_geometry(t1.value)
        geom2 = parse_geometry(t2.value)
        coords1 = extract_coordinates(geom1)
        coords2 = extract_coordinates(geom2)
        if geom1 is None or geom2 is None or coords1 is None or coords2 is None:
            return None
        else:
            distance_km = geodesic(coords1, coords2).kilometers
            return Literal(str(distance_km),datatype=NamedNode('http://www.w3.org/2001/XMLSchema#decimal'))
    except Exception as e:
        return None

def px_area(t1):
    try:
        geom = parse_geometry(t1.value)        
        if not isinstance(geom, (Polygon, MultiPolygon)):
            raise ValueError("Geometry is not a Polygon or MultiPolygon")        
        geod = Geod(ellps="WGS84")
        area, _ = geod.geometry_area_perimeter(geom)
        area_km2 = abs(area) / 1e6  # 1 km² = 1,000,000 m²
        return Literal(str(area_km2), datatype=NamedNode('http://www.w3.org/2001/XMLSchema#decimal'))
    except Exception as e:
        return None

def parse_geometry(geom_str):
    try:
        return wkt.loads(geom_str)
    except Exception:
        pass  # no WKT, try GeoJSON    
    try:
        geojson_obj = json.loads(geom_str)
        return shape(geojson_obj)
    except Exception:
        return None

def extract_coordinates(geom):
    if isinstance(geom, Point):
        return (geom.y, geom.x)
    elif isinstance(geom, (Polygon, LineString, MultiPoint, MultiPolygon)):
        centroid = geom.centroid
        return (centroid.y, centroid.x)
    else:
        return None

# /calc

def px_log(t1):
    try:
        value = float(t1.value)        
        if value <= 0:
            return None        
        result = math.log(value)
        return Literal(str(result), datatype=NamedNode('http://www.w3.org/2001/XMLSchema#decimal'))
    
    except (ValueError, TypeError) as e:
        return None

# /nlp

def px_fuzzy_ratio(t1, t2):
    try:
        # Extrahiere die Zeichenketten aus den Literalen
        str1 = str(t1.value)
        str2 = str(t2.value)        
        # Fuzzy-Wuzzy-Ratio
        if not str1.strip() or not str2.strip():
            raise ValueError("Empty string!")
        ratio = fuzz.ratio(str1, str2)
        return Literal(str(ratio), datatype=NamedNode('http://www.w3.org/2001/XMLSchema#integer'))    
    except Exception as e:        
        return Literal("-1", datatype=NamedNode('http://www.w3.org/2001/XMLSchema#integer'))