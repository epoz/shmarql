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
