from .main import app
from .config import MOUNT


@app.get(f"{MOUNT}test")
def test():
    return "Hello, World!"
