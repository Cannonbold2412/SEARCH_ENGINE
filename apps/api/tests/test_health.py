"""Test health check endpoint."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test that the health check endpoint returns OK."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_api_root(client: AsyncClient):
    """Test that the API root returns basic info."""
    response = await client.get("/")
    assert response.status_code == 200
