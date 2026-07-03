import pytest
import httpx
from sqlalchemy import text
from src.db.database import async_session

BASE_URL = "http://localhost:8000"


async def test_register_login():
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        reg_data = {
            "name": "string",
            "password": "stringst",
            "phone_number": "89101649604",
            "description": "string",
        }
        response = await client.post("/auth/register", json=reg_data)
        assert response.status_code == 201

        login_data = {
            "phone_number": "89101649604",
            "password": "stringst",
        }
        response = await client.post("/auth/login", json=login_data)
        assert response.status_code == 200

    async with async_session() as session:
        await session.execute(text("DELETE FROM users WHERE phone_number = '89101649604'"))
        await session.commit()
