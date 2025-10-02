import pandas as pd
import plotly.express as px
from .px_util import do_prefixes


def do_barchart(settings: dict, data: pd.DataFrame, label=None):
    x_col = settings.get("x", ["label"])[0]
    y_col = settings.get("y", ["value"])[0]
    data[y_col] = data[y_col].astype(float)
    data[x_col] = data[x_col].apply(do_prefixes)
    return px.bar(data, x=x_col, y=y_col, title=label)


def do_piechart(settings: dict, data: pd.DataFrame, label=None):
    label = settings.get("label", [None])[0]
    values = settings.get("values", ["value"])[0]
    names = settings.get("names", ["label"])[0]
    data[values] = data[values].astype(float)
    data[names] = data[names].apply(do_prefixes)
    return px.pie(data, values=values, names=names, title=label)


def do_mapchart(settings: dict, data: pd.DataFrame, label=None):
    point = settings.get("point", ["geo"])[0]

    if point in data.columns:

        def safe_extract_lat(point):
            try:
                return float(point.upper().replace("POINT(", "").split(" ")[0])
            except Exception:
                return None

        def safe_extract_lon(point):
            try:
                return float(
                    point.upper().replace("POINT(", "").strip(")").split(" ")[1]
                )
            except Exception:
                return None

        data["lon"] = data[point].apply(safe_extract_lat)
        data["lat"] = data[point].apply(safe_extract_lon)

        # Remove rows where lat or lon is None
        data = data.dropna(subset=["lat", "lon"])

    if "lat" not in data.columns or "lon" not in data.columns:
        raise ValueError(
            "Data must contain 'lat' and 'lon' columns for map chart, or a 'geo' column containing Point(x y) format."
        )

    lat_col = "lat"
    lon_col = "lon"

    data[lat_col] = data[lat_col].astype(float)
    data[lon_col] = data[lon_col].astype(float)

    center_lat = float(settings.get("lat", [0])[0])
    center_lon = float(settings.get("lon", [0])[0])

    zoom = int(settings.get("zoom", [3])[0])
    return px.scatter_map(
        data,
        lat=lat_col,
        lon=lon_col,
        zoom=zoom,
        title=label,
        center={"lat": center_lat, "lon": center_lon},
    )
