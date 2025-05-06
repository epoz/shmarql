from functools import wraps
from typing import Callable, List, Optional, Set, Type, Union, Dict, Any
from starlette.applications import Starlette
from starlette.routing import Route, Router


def prepend_route(
    app: Union[Starlette, Router],
    path: str,
    methods: Optional[List[str]] = None,
    status_code: Optional[int] = None,
    name: Optional[str] = None,
    include_in_schema: bool = True,
):
    """
    A decorator that prepends a route to the beginning of the Starlette app's routes list.
    This ensures the route is checked before other routes during request processing.

    Usage:
        @prepend_route(app, "/my-priority-route")
        async def my_priority_handler(request):
            return JSONResponse({"message": "I get processed first!"})
    """
    if methods is None:
        methods = ["GET"]

    def decorator(func: Callable):
        # Create the route with the function
        route = Route(
            path=path,
            endpoint=func,
            methods=methods,
            name=name or func.__name__,
            include_in_schema=include_in_schema,
        )

        if hasattr(app, "routes"):
            app.routes.insert(0, route)
        elif hasattr(app, "router") and hasattr(app.router, "routes"):
            app.router.routes.insert(0, route)
        else:
            raise ValueError("Unable to find routes list in provided app")

        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)

        return wrapper

    return decorator
