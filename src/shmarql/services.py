from fastapi import Request
from fastapi.responses import StreamingResponse
import httpx


async def proxy_request(request: Request, target_host: str):

    path = request.url.path
    target_url = f"{target_host}{path}"

    if request.url.query:
        target_url += f"?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)

    async with httpx.AsyncClient() as client:
        response = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=(
                await request.body()
                if request.method in ["POST", "PUT", "PATCH"]
                else None
            ),
            follow_redirects=True,
            timeout=60,
        )

        return StreamingResponse(
            content=iter([response.content]),
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.headers.get("content-type"),
        )
