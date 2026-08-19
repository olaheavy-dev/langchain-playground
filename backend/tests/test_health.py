import httpx


async def test_health_reports_ok(client: httpx.AsyncClient) -> None:
    response = await client.get('/health')

    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


async def test_cors_allows_the_frontend_origin(client: httpx.AsyncClient) -> None:
    """The frontend is served from a different origin, so the browser will not
    read a response without this header."""
    response = await client.get('/health', headers={'Origin': 'http://localhost:3000'})

    assert response.headers['access-control-allow-origin'] == 'http://localhost:3000'


async def test_cors_rejects_an_unknown_origin(client: httpx.AsyncClient) -> None:
    response = await client.get('/health', headers={'Origin': 'http://evil.example'})

    assert 'access-control-allow-origin' not in response.headers
