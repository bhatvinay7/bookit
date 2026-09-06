import os
import requests
import pytest
import uuid

API_URL = os.getenv("API_URL", "http://localhost:8080")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@bookit.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "password123")

@pytest.fixture(scope="session")
def admin_token():
    """Fetches an admin JWT token for use in tests."""
    response = requests.post(
        f"{API_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Could not log in as admin. Status {response.status_code}. Make sure admin user exists.")
    
    data = response.json()
    assert "token" in data
    assert data["user"]["role"] == "Admin"
    return data["token"]

@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ─── Auth / Me Tests ──────────────────────────────────────────────────────────

def test_admin_me_endpoint(auth_headers):
    """Verify the /api/auth/me endpoint works for the admin dashboard"""
    res = requests.get(f"{API_URL}/api/auth/me", headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["role"] == "Admin"
    assert "id" in data
    assert "email" in data


# ─── Admin Categories API Tests ───────────────────────────────────────────────

def test_categories_unauthorized():
    """Verify that admin APIs reject unauthenticated requests"""
    res = requests.get(f"{API_URL}/api/admin/categories")
    assert res.status_code == 401

def test_create_and_list_categories(auth_headers):
    # 1. Create a category
    unique_slug = f"test-category-{uuid.uuid4().hex[:6]}"
    payload = {
        "name": "Test Category",
        "slug": unique_slug,
        "description": "Created by pytest",
        "image_url": "http://example.com/img.png"
    }
    res = requests.post(f"{API_URL}/api/admin/categories", json=payload, headers=auth_headers)
    assert res.status_code in (200, 201), res.text
    created = res.json()
    assert "id" in created
    assert created["slug"] == unique_slug
    cat_id = created["id"]

    # 2. List categories
    res = requests.get(f"{API_URL}/api/admin/categories", headers=auth_headers)
    assert res.status_code == 200
    categories = res.json()
    assert isinstance(categories, list)
    assert any(c["id"] == cat_id for c in categories)

    # 3. Get category by ID
    res = requests.get(f"{API_URL}/api/admin/categories/{cat_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["slug"] == unique_slug

    # 4. Update category
    update_payload = {
        "name": "Updated Category",
        "slug": unique_slug,
        "description": "Updated by pytest"
    }
    res = requests.put(f"{API_URL}/api/admin/categories/{cat_id}", json=update_payload, headers=auth_headers)
    assert res.status_code in (200, 204)
    # The API might not return the updated object on 204

    # 5. Delete category
    res = requests.delete(f"{API_URL}/api/admin/categories/{cat_id}", headers=auth_headers)
    assert res.status_code in (200, 204)

    # 6. Verify deletion
    res = requests.get(f"{API_URL}/api/admin/categories/{cat_id}", headers=auth_headers)
    assert res.status_code == 404


# ─── Admin Shows API Tests ────────────────────────────────────────────────────

def test_create_and_list_shows(auth_headers):
    # 1. Create a show
    payload = {
        "show_type": "Movie",
        "title": f"Pytest Movie {uuid.uuid4().hex[:6]}",
        "duration_minutes": 120,
        "release_date": "2026-10-01T00:00:00Z",
        "language": "English",
        "genre": ["Action", "Sci-Fi"],
        "poster_url": "http://example.com/poster.png",
        "cast": [{"name": "Actor A", "photo_url": "http://example.com/a.jpg"}]
    }
    res = requests.post(f"{API_URL}/api/admin/shows", json=payload, headers=auth_headers)
    assert res.status_code in (200, 201), res.text
    created = res.json()
    assert "id" in created
    show_id = created["id"]

    # 2. List shows
    res = requests.get(f"{API_URL}/api/admin/shows", headers=auth_headers)
    assert res.status_code == 200
    shows = res.json()
    assert isinstance(shows, list)
    assert isinstance(shows, list)

    # 3. Delete show
    res = requests.delete(f"{API_URL}/api/admin/shows/{show_id}", headers=auth_headers)
    assert res.status_code in (200, 204)

# ─── Admin Layouts API Tests ──────────────────────────────────────────────────

def test_layouts_crud(auth_headers):
    # 1. Create a layout
    payload = {
        "name": f"Test Layout {uuid.uuid4().hex[:6]}",
        "show_type": "Movie",
        "layout_shape": "Grid"
    }
    res = requests.post(f"{API_URL}/api/admin/layouts", json=payload, headers=auth_headers)
    assert res.status_code in (200, 201), res.text
    layout = res.json()
    assert "id" in layout
    layout_id = layout["id"]

    # 2. Add seats to layout
    seats_payload = {
        "seats": [
            {"row_letter": "A", "seat_number": 1, "seat_class": "Standard", "x_pos": 0, "y_pos": 0},
            {"row_letter": "A", "seat_number": 2, "seat_class": "Standard", "x_pos": 1, "y_pos": 0}
        ]
    }
    res = requests.post(f"{API_URL}/api/admin/layouts/{layout_id}/seats", json=seats_payload, headers=auth_headers)
    assert res.status_code in (200, 201)
    added_seats = res.json()
    assert "seats" in added_seats
    assert len(added_seats["seats"]) == 2

    # 3. Get layout
    res = requests.get(f"{API_URL}/api/admin/layouts/{layout_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["name"] == payload["name"]

    # 4. Delete layout
    res = requests.delete(f"{API_URL}/api/admin/layouts/{layout_id}", headers=auth_headers)
    assert res.status_code == 200

# ─── Admin Cities & Stats API Tests ───────────────────────────────────────────

def test_cities_endpoint(auth_headers):
    res = requests.get(f"{API_URL}/api/admin/cities", headers=auth_headers)
    assert res.status_code == 200
    assert "cities" in res.json()

def test_stats_endpoint(auth_headers):
    res = requests.get(f"{API_URL}/api/admin/stats", headers=auth_headers)
    assert res.status_code == 200
    stats = res.json()
    assert "total_users" in stats
    assert "total_bookings" in stats

# ─── Admin Schedules API Tests ────────────────────────────────────────────────

def test_schedules_crud(auth_headers):
    # We need a layout and a show to create a schedule, but let's assume valid UUIDs for testing,
    # or create dummy ones. For simplicity, we just use random UUIDs if the API accepts them, 
    # but since it's an end-to-end test against a DB, let's create a layout and show first.
    
    # 1. Create a layout
    layout_payload = {"name": f"Sched Layout {uuid.uuid4().hex[:6]}", "show_type": "Movie", "layout_shape": "Grid"}
    res = requests.post(f"{API_URL}/api/admin/layouts", json=layout_payload, headers=auth_headers)
    assert res.status_code in (200, 201), res.text
    layout_id = res.json()["id"]

    # 1.5 Add seats
    seats_payload = {
        "seats": [
            {"row_letter": "A", "seat_number": 1, "seat_class": "Standard", "x_pos": 0, "y_pos": 0}
        ]
    }
    requests.post(f"{API_URL}/api/admin/layouts/{layout_id}/seats", json=seats_payload, headers=auth_headers)

    # 2. Create a show
    show_payload = {
        "show_type": "Movie", "title": f"Sched Movie {uuid.uuid4().hex[:6]}",
        "duration_minutes": 120, "release_date": "2026-10-01T00:00:00Z",
        "language": "English", "genre": ["Action"], "poster_url": "http://example.com/poster.png", "cast": []
    }
    res = requests.post(f"{API_URL}/api/admin/shows", json=show_payload, headers=auth_headers)
    assert res.status_code in (200, 201), res.text
    show_id = res.json()["id"]

    # 3. Create schedule
    schedule_payload = {
        "layout_id": layout_id,
        "mongo_show_id": show_id,
        "show_type": "Movie",
        "date": "2027-10-01",
        "slot": "Morning",
        "start_time": "2027-10-01T10:00:00Z",
        "end_time": "2027-10-01T12:00:00Z",
        "booking_open_at": "2027-09-01T10:00:00Z",
        "status": "Draft",
        "prices": {"Standard": "15.00"},
        "venue_city": "Test City"
    }
    res = requests.post(f"{API_URL}/api/admin/schedules", json=schedule_payload, headers=auth_headers)
    assert res.status_code in (200, 201), res.text
    schedule = res.json()
    assert "id" in schedule
    schedule_id = schedule["id"]

    # 4. List schedules
    res = requests.get(f"{API_URL}/api/admin/schedules", headers=auth_headers)
    assert res.status_code == 200
    schedules = res.json()
    assert isinstance(schedules, list)
    assert any(s["id"] == schedule_id for s in schedules)

    # 5. Add extra seats
    extra_seats = {
        "seats": [{"seat_label": "EXT1", "tier": "VIP", "x": 10, "y": 10, "is_active": True, "price": 100}]
    }
    res = requests.post(f"{API_URL}/api/admin/schedules/{schedule_id}/seats", json=extra_seats, headers=auth_headers)
    assert res.status_code == 200, res.text

    # 6. Start schedule
    res = requests.post(f"{API_URL}/api/admin/schedules/{schedule_id}/start", headers=auth_headers)
    assert res.status_code == 200, res.text

    # 7. Delete schedule
    res = requests.delete(f"{API_URL}/api/admin/schedules/{schedule_id}", headers=auth_headers)
    assert res.status_code == 200
