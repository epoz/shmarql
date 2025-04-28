from functools import wraps
from typing import Callable, List, Optional, Set, Type, Union
from fastapi import FastAPI, APIRouter
from fastapi.routing import APIRoute


def prepend_route(
    app: Union[FastAPI, APIRouter],
    path: str,
    methods: Optional[List[str]] = None,
    status_code: Optional[int] = None,
    tags: Optional[List[str]] = None,
    summary: Optional[str] = None,
    description: Optional[str] = None,
    response_model: Optional[Type] = None,
    name: Optional[str] = None,
    deprecated: Optional[bool] = None,
    include_in_schema: bool = True,
):
    """
    A decorator that prepends a route to the beginning of the FastAPI app's routes list.
    This ensures the route is checked before other routes during request processing.

    Usage:
        @prepend_route(app, "/my-priority-route")
        async def my_priority_handler():
            return {"message": "I get processed first!"}
    """
    if methods is None:
        methods = ["GET"]

    def decorator(func: Callable):
        # Create the route with the function
        route = APIRoute(
            path=path,
            endpoint=func,
            methods=methods,
            name=name or func.__name__,
            response_model=response_model,
            status_code=status_code,
            tags=tags,
            summary=summary,
            description=description,
            deprecated=deprecated,
            include_in_schema=include_in_schema,
        )

        # Insert the route at the beginning of the routes list
        app.router.routes.insert(0, route)

        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)

        return wrapper

    return decorator
