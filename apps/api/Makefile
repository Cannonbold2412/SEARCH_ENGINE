PYTHON ?= python

.PHONY: dev migrate lint format seed test

dev:
	$(PYTHON) -m uvicorn src.main:app --reload

migrate:
	$(PYTHON) -m alembic upgrade head

lint:
	$(PYTHON) -m ruff check src/ tests/

format:
	$(PYTHON) -m ruff format src/ tests/

seed:
	$(PYTHON) ../scripts/seed_demo_profiles.py

test:
	$(PYTHON) -m pytest
