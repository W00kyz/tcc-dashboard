# Prédios no mapa da operação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar num prédio no mapa da operação aproxima o mapa até ele e abre um painel com os andares e os pontos de serviço de cada andar, com a situação de hoje.

**Architecture:** O backend guarda o contorno do prédio (GeoJSON em JSONB) e expõe `PUT/DELETE /buildings/{id}/footprint`. O painel importa contornos do OpenStreetMap (Overpass) só na tela de Andares, para o gestor vincular; o mapa da operação desenha os contornos (ou a envoltória dos pontos, se não houver contorno) e, ao clicar, abre o painel interno com dados de `/floors`, `/service-points` e das rotas do dia.

**Tech Stack:** Backend — FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, pytest + testcontainers (PostGIS). Painel — React 19, TypeScript 5.9, React Query 5, Leaflet 1.9, Vitest + Testing Library, shadcn.

**Spec:** `tcc-dashboard/docs/superpowers/specs/2026-10-11-predios-no-mapa-design.md`

## Global Constraints

- Código em inglês; texto visível em pt-BR via `src/i18n/strings.ts` (painel) — nunca fixo em componente.
- Versões exatas no `package.json`, sem `^`/`~`; **nenhuma dependência nova** neste plano (Leaflet já cobre polígonos).
- `typescript` fica em `5.9.3` e `zod` em `3.25.76` (DO NOT CHANGE no `CLAUDE.md`).
- Testes nunca tocam a rede: Overpass e API via `fetch` injetado/fake.
- Testes de comportamento (papel, rótulo, texto), não de classes CSS ou estrutura do DOM.
- Regra de negócio em módulo TS puro com teste ao lado (`src/lib/`), não em componente.
- Funções de 4–20 linhas, arquivos < 500 linhas, imports pelo alias `@/`.
- Mensagens de erro com o valor ofensor e o formato esperado.
- Contorno: GeoJSON `Polygon`, 1 anel, 4–500 posições, anel fechado, `-180≤lon≤180`, `-90≤lat≤90`.
- Commits só quando o usuário pedir (regra do `CLAUDE.md`); sem `Co-Authored-By`. Os passos "Commit" abaixo ficam como pontos de parada para revisão.
- Validação antes de encerrar cada task — backend: `uv run ruff check . && uv run ruff format --check . && uv run mypy app tests && uv run pytest <arquivos> --no-cov`; painel: `npm run format:check && npm run lint && npm run typecheck && npx vitest run <arquivos>`.

## Review Focus

1. **Prédio sem andares ou sem pontos** — o painel do prédio deve abrir com "Nenhum andar cadastrado"/"Nenhum ponto neste andar", sem erro. (Task 8)
2. **Ponto visitado por mais de uma rota hoje** — a situação mostrada é a mais urgente (atrasado > em andamento > pendente > feito). (Task 6)
3. **Prédios sobrepostos/contorno OSM de outro prédio já vinculado** — vincular o mesmo `osm_way_id` a dois prédios é permitido, mas o mapa de vínculo deve indicar "Já vinculado a <prédio>". (Task 5)
4. **Overpass devolve multipolígono/relation ou way sem `geometry`** — descartado sem quebrar a lista. (Task 4)
5. **Clique no mapa fora de qualquer prédio com o painel aberto** — fecha o painel; clique num profissional com o painel aberto continua deslizando até ele. (Task 7)

---

## File Structure

**Backend (`tcc-backend`)**

- Modify `app/domain/catalog/models.py` — 3 colunas em `Building`.
- Create `alembic/versions/b7c4e2f9a1d3_add_building_footprint.py` — migração.
- Create `app/domain/catalog/footprint.py` — modelo Pydantic `PolygonFootprint` (validação).
- Modify `app/api/buildings.py` — campos em `BuildingOut`, `PUT`/`DELETE /{id}/footprint`.
- Create `tests/api/test_building_footprint.py`; Create `tests/domain/catalog/test_footprint.py`.

**Painel (`tcc-dashboard`)**

- Create `src/lib/campus.ts` — `CAMPUS_BOUNDS` compartilhado.
- Create `src/lib/osmBuildings.ts` (+ teste) — consulta Overpass e parse.
- Create `src/api/overpass.ts` — cliente fino com `fetch` injetável.
- Create `src/components/buildings/BuildingFootprintSection.tsx` (+ teste) — seção na página de Andares.
- Create `src/components/buildings/FootprintPickerMap.tsx` — mapa de vínculo.
- Create `src/lib/buildingInterior.ts` (+ teste) — envoltória convexa, situação dos pontos.
- Create `src/components/board/BuildingsLayer.ts` — desenho dos prédios no Leaflet (sem React).
- Create `src/components/board/BuildingPanel.tsx` (+ teste) — painel interno.
- Create `src/components/board/useBuildingInterior.ts` — queries de andares/pontos.
- Modify `src/components/WorkerPositionsMap.tsx`, `src/components/board/OperationsMapPanel.tsx`, `src/routes/RouteBoardPage.tsx`, `src/routes/FloorsPage.tsx`, `src/routes/BuildingsPage.tsx`, `src/i18n/strings.ts`, `DESIGN.md`.

---

### Task 1: Backend — contorno no modelo, migração e leitura

**Files:**

- Modify: `tcc-backend/app/domain/catalog/models.py:64-68`
- Create: `tcc-backend/alembic/versions/b7c4e2f9a1d3_add_building_footprint.py`
- Modify: `tcc-backend/app/api/buildings.py` (`BuildingOut`, `_to_out`)
- Test: `tcc-backend/tests/api/test_building_footprint.py`

**Interfaces:**

- Produces: `Building.footprint: dict | None`, `Building.footprint_source: str | None`, `Building.osm_way_id: int | None`; `BuildingOut` com `footprint: dict | None = None`, `footprint_source: str | None = None`, `osm_way_id: int | None = None`.

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_building_footprint.py
from app.core.security import hash_password
from app.domain.catalog.models import Building
from app.domain.identity.models import User, UserRole
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

PASSWORD = "senha-forte-o-suficiente"


async def _token(client: TestClient, db: AsyncSession, role: UserRole = UserRole.MANAGER) -> str:
    user = User(
        name="Gestora",
        email=f"{role.value.lower()}@pu.ufcg.edu.br",
        password_hash=hash_password(PASSWORD),
        role=role,
    )
    db.add(user)
    await db.commit()
    response = client.post("/auth/login", json={"email": user.email, "password": PASSWORD})
    return str(response.json()["access_token"])


async def test_a_building_without_footprint_lists_null_geo_fields(
    client: TestClient, db_session: AsyncSession
) -> None:
    db_session.add(Building(name="Bloco CD", campus_area="CEEI"))
    await db_session.commit()
    token = await _token(client, db_session)

    listing = client.get("/buildings", headers={"Authorization": f"Bearer {token}"})

    [building] = listing.json()
    assert building["footprint"] is None
    assert building["footprint_source"] is None
    assert building["osm_way_id"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tcc-backend && uv run pytest tests/api/test_building_footprint.py --no-cov -q`
Expected: FAIL — `KeyError: 'footprint'`.

- [ ] **Step 3: Implement model, migration and output fields**

```python
# app/domain/catalog/models.py — add imports and columns
from typing import Any
from sqlalchemy import BigInteger
from sqlalchemy.dialects.postgresql import JSONB


class Building(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "buildings"

    name: Mapped[str] = mapped_column(String(200))
    campus_area: Mapped[str] = mapped_column(String(200))
    # GeoJSON Polygon outline shown on the dashboard map; validated by
    # app/domain/catalog/footprint.py before it is stored. JSONB, not PostGIS geometry: it is
    # only drawn, never queried spatially (spec 2026-10-11, "JSONB").
    footprint: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Where the outline came from ("osm" today) and the OSM way id, so it can be traced/reimported.
    footprint_source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    osm_way_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
```

```python
# alembic/versions/b7c4e2f9a1d3_add_building_footprint.py
"""add building footprint

Revision ID: b7c4e2f9a1d3
Revises: 3cf7fec14642
Create Date: 2026-10-11 21:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b7c4e2f9a1d3"
down_revision: str | Sequence[str] | None = "3cf7fec14642"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Nullable columns: every existing building stays valid, just without an outline."""
    op.add_column(
        "buildings", sa.Column("footprint", postgresql.JSONB(), nullable=True)
    )
    op.add_column("buildings", sa.Column("footprint_source", sa.String(20), nullable=True))
    op.add_column("buildings", sa.Column("osm_way_id", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("buildings", "osm_way_id")
    op.drop_column("buildings", "footprint_source")
    op.drop_column("buildings", "footprint")
```

```python
# app/api/buildings.py
class BuildingOut(BaseModel):
    id: UUID
    name: str
    campus_area: str
    footprint: dict[str, Any] | None = None
    footprint_source: str | None = None
    osm_way_id: int | None = None


def _to_out(building: Building) -> BuildingOut:
    return BuildingOut(
        id=building.id,
        name=building.name,
        campus_area=building.campus_area,
        footprint=building.footprint,
        footprint_source=building.footprint_source,
        osm_way_id=building.osm_way_id,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/api/test_building_footprint.py tests/api/test_buildings.py --no-cov -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Validate and stop for review** — `uv run ruff check . && uv run ruff format --check . && uv run mypy app tests`.

---

### Task 2: Backend — `PUT`/`DELETE /buildings/{id}/footprint` com validação e auditoria

**Files:**

- Create: `tcc-backend/app/domain/catalog/footprint.py`
- Modify: `tcc-backend/app/api/buildings.py`
- Test: `tcc-backend/tests/domain/catalog/test_footprint.py`, `tcc-backend/tests/api/test_building_footprint.py`

**Interfaces:**

- Consumes: Task 1 columns and `BuildingOut`.
- Produces: `PolygonFootprint` (Pydantic) with `.model_dump()` → GeoJSON dict; `BuildingFootprintRequest { footprint: PolygonFootprint, osm_way_id: int }`; endpoints `PUT /buildings/{building_id}/footprint` → 200 `BuildingOut`, `DELETE /buildings/{building_id}/footprint` → 200 `BuildingOut`; 404 unknown building, 422 invalid polygon, 403 field worker.

- [ ] **Step 1: Write failing validation tests**

```python
# tests/domain/catalog/test_footprint.py  (create tests/domain/catalog/__init__.py if missing)
import pytest
from app.domain.catalog.footprint import PolygonFootprint
from pydantic import ValidationError

SQUARE = [[-35.909, -7.214], [-35.908, -7.214], [-35.908, -7.215], [-35.909, -7.214]]


def test_accepts_a_closed_single_ring_polygon() -> None:
    footprint = PolygonFootprint(type="Polygon", coordinates=[SQUARE])
    assert footprint.model_dump() == {"type": "Polygon", "coordinates": [SQUARE]}


@pytest.mark.parametrize(
    ("coordinates", "fragment"),
    [
        ([SQUARE[:-1] + [[-35.9, -7.2]]], "closed"),
        ([SQUARE[:3]], "at least 4"),
        ([SQUARE * 130], "at most 500"),
        ([SQUARE, SQUARE], "one ring"),
        ([[[-200.0, -7.2], [-35.9, -7.2], [-35.9, -7.3], [-200.0, -7.2]]], "longitude"),
        ([[[-35.9, -95.0], [-35.8, -7.2], [-35.8, -7.3], [-35.9, -95.0]]], "latitude"),
    ],
)
def test_rejects_malformed_rings(coordinates: list[list[list[float]]], fragment: str) -> None:
    with pytest.raises(ValidationError, match=fragment):
        PolygonFootprint(type="Polygon", coordinates=coordinates)


def test_rejects_other_geometry_types() -> None:
    with pytest.raises(ValidationError):
        PolygonFootprint(type="MultiPolygon", coordinates=[SQUARE])  # type: ignore[arg-type]
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/domain/catalog/test_footprint.py --no-cov -q`
Expected: FAIL — `ModuleNotFoundError: app.domain.catalog.footprint`.

- [ ] **Step 3: Implement the validator**

```python
# app/domain/catalog/footprint.py
"""The building outline the dashboard draws: a GeoJSON Polygon with one closed ring
(spec 2026-10-11). Validated here so the JSONB column never holds a shape the map cannot draw."""

from typing import Literal

from pydantic import BaseModel, field_validator

MIN_POSITIONS = 4  # a triangle plus the repeated closing position
MAX_POSITIONS = 500

Position = list[float]


def _check_position(position: Position) -> None:
    if len(position) != 2:
        raise ValueError(f"position {position} must be [longitude, latitude].")
    longitude, latitude = position
    if not -180 <= longitude <= 180:
        raise ValueError(f"longitude {longitude} out of range; expected -180..180.")
    if not -90 <= latitude <= 90:
        raise ValueError(f"latitude {latitude} out of range; expected -90..90.")


def _check_ring(ring: list[Position]) -> None:
    if len(ring) < MIN_POSITIONS:
        raise ValueError(f"ring has {len(ring)} positions; expected at least 4.")
    if len(ring) > MAX_POSITIONS:
        raise ValueError(f"ring has {len(ring)} positions; expected at most 500.")
    if ring[0] != ring[-1]:
        raise ValueError(f"ring starts at {ring[0]} and ends at {ring[-1]}; it must be closed.")
    for position in ring:
        _check_position(position)


class PolygonFootprint(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[Position]]

    @field_validator("coordinates")
    @classmethod
    def _single_closed_ring(cls, rings: list[list[Position]]) -> list[list[Position]]:
        if len(rings) != 1:
            raise ValueError(f"polygon has {len(rings)} rings; expected exactly one ring.")
        _check_ring(rings[0])
        return rings
```

- [ ] **Step 4: Run validation tests** — `uv run pytest tests/domain/catalog/test_footprint.py --no-cov -q` → PASS (8).

- [ ] **Step 5: Write failing endpoint tests** (append to `tests/api/test_building_footprint.py`)

```python
from app.domain.audit.models import AuditTrail
from sqlalchemy import select

SQUARE = [[-35.909, -7.214], [-35.908, -7.214], [-35.908, -7.215], [-35.909, -7.214]]


async def _building(db: AsyncSession) -> str:
    building = Building(name="Bloco CD", campus_area="CEEI")
    db.add(building)
    await db.commit()
    return str(building.id)


async def test_manager_links_replaces_and_clears_a_footprint(
    client: TestClient, db_session: AsyncSession
) -> None:
    building_id = await _building(db_session)
    auth = {"Authorization": f"Bearer {await _token(client, db_session)}"}
    body = {"footprint": {"type": "Polygon", "coordinates": [SQUARE]}, "osm_way_id": 123}

    linked = client.put(f"/buildings/{building_id}/footprint", json=body, headers=auth)
    assert linked.status_code == 200
    assert linked.json()["footprint_source"] == "osm"
    assert linked.json()["osm_way_id"] == 123

    replaced = client.put(
        f"/buildings/{building_id}/footprint", json={**body, "osm_way_id": 456}, headers=auth
    )
    assert replaced.json()["osm_way_id"] == 456

    cleared = client.delete(f"/buildings/{building_id}/footprint", headers=auth)
    assert cleared.status_code == 200
    assert cleared.json()["footprint"] is None
    assert cleared.json()["osm_way_id"] is None


async def test_an_open_ring_is_refused_with_422(
    client: TestClient, db_session: AsyncSession
) -> None:
    building_id = await _building(db_session)
    auth = {"Authorization": f"Bearer {await _token(client, db_session)}"}
    open_ring = SQUARE[:-1] + [[-35.9, -7.2]]

    response = client.put(
        f"/buildings/{building_id}/footprint",
        json={"footprint": {"type": "Polygon", "coordinates": [open_ring]}, "osm_way_id": 1},
        headers=auth,
    )

    assert response.status_code == 422


async def test_unknown_building_is_404(client: TestClient, db_session: AsyncSession) -> None:
    auth = {"Authorization": f"Bearer {await _token(client, db_session)}"}
    body = {"footprint": {"type": "Polygon", "coordinates": [SQUARE]}, "osm_way_id": 1}

    response = client.put(
        "/buildings/00000000-0000-0000-0000-000000000000/footprint", json=body, headers=auth
    )

    assert response.status_code == 404


async def test_field_worker_cannot_link_a_footprint(
    client: TestClient, db_session: AsyncSession
) -> None:
    building_id = await _building(db_session)
    auth = {"Authorization": f"Bearer {await _token(client, db_session, UserRole.FIELD_WORKER)}"}
    body = {"footprint": {"type": "Polygon", "coordinates": [SQUARE]}, "osm_way_id": 1}

    response = client.put(f"/buildings/{building_id}/footprint", json=body, headers=auth)

    assert response.status_code == 403


async def test_linking_is_recorded_in_the_audit_trail(
    client: TestClient, db_session: AsyncSession
) -> None:
    building_id = await _building(db_session)
    auth = {"Authorization": f"Bearer {await _token(client, db_session)}"}
    body = {"footprint": {"type": "Polygon", "coordinates": [SQUARE]}, "osm_way_id": 77}

    client.put(f"/buildings/{building_id}/footprint", json=body, headers=auth)

    actions = (
        await db_session.scalars(select(AuditTrail.action).where(AuditTrail.entity_type == "building"))
    ).all()
    assert "set_footprint" in actions
```

- [ ] **Step 6: Run to verify failure** — `uv run pytest tests/api/test_building_footprint.py --no-cov -q` → FAIL (405 Method Not Allowed on PUT).

- [ ] **Step 7: Implement the endpoints** (in `app/api/buildings.py`)

```python
from app.domain.catalog.footprint import PolygonFootprint

_Actor = Annotated[User, Depends(require_role(UserRole.MANAGER, UserRole.ADMIN))]
_Db = Annotated[AsyncSession, Depends(get_db)]


class BuildingFootprintRequest(BaseModel):
    footprint: PolygonFootprint
    osm_way_id: int


async def _load_building(db: AsyncSession, building_id: UUID) -> Building:
    building = await db.get(Building, building_id)
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'Building "{building_id}" not found.')
    return building


async def _audit_footprint(
    db: AsyncSession, actor: User, building: Building, action: str, before: int | None
) -> None:
    await record_audit_trail(
        db,
        actor_id=actor.id,
        entity_type="building",
        entity_id=building.id,
        action=action,
        before={"osm_way_id": before},
        after={"osm_way_id": building.osm_way_id},
    )


@router.put("/{building_id}/footprint", response_model=BuildingOut)
async def set_building_footprint(
    building_id: UUID, body: BuildingFootprintRequest, actor: _Actor, db: _Db
) -> BuildingOut:
    building = await _load_building(db, building_id)
    before = building.osm_way_id
    building.footprint = body.footprint.model_dump()
    building.footprint_source = "osm"
    building.osm_way_id = body.osm_way_id
    await _audit_footprint(db, actor, building, "set_footprint", before)
    await db.commit()
    return _to_out(building)


@router.delete("/{building_id}/footprint", response_model=BuildingOut)
async def clear_building_footprint(building_id: UUID, actor: _Actor, db: _Db) -> BuildingOut:
    building = await _load_building(db, building_id)
    before = building.osm_way_id
    building.footprint = None
    building.footprint_source = None
    building.osm_way_id = None
    await _audit_footprint(db, actor, building, "clear_footprint", before)
    await db.commit()
    return _to_out(building)
```

- [ ] **Step 8: Run tests** — `uv run pytest tests/api/test_building_footprint.py tests/domain/catalog/test_footprint.py tests/api/test_buildings.py --no-cov -q` → PASS.

- [ ] **Step 9: Full backend check** — `uv run ruff check . && uv run ruff format --check . && uv run mypy app tests && uv run pytest` (coverage gate 70%). Stop for review.

---

### Task 3: Contrato — exportar OpenAPI e regenerar os tipos do painel

**Files:**

- Create: `tcc/docs/api/openapi.json` (generated)
- Modify: `tcc-dashboard/src/api/generated/schema.d.ts` (generated)

**Interfaces:**

- Produces: `components["schemas"]["BuildingOut"]` with `footprint`, `footprint_source`, `osm_way_id`; paths `/buildings/{building_id}/footprint` (`put`, `delete`); `components["schemas"]["BuildingFootprintRequest"]`.

- [ ] **Step 1: Export** — from `tcc-backend`:

```bash
mkdir -p ../docs/api
DATABASE_URL=postgresql+asyncpg://x:x@localhost/x JWT_SECRET_KEY=x QR_SIGNING_PRIVATE_KEY_HEX=$(printf '0%.0s' {1..64}) \
  uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi(), indent=2, ensure_ascii=False))" > ../docs/api/openapi.json
```

- [ ] **Step 2: Regenerate** — from `tcc-dashboard`: `npm run generate:api`.
- [ ] **Step 3: Verify** — `git diff --stat src/api/generated/schema.d.ts` shows only building/footprint additions (if unrelated drift appears, stop and report it); `npm run typecheck && npx vitest run` → all pass.

---

### Task 4: Painel — consulta e parse dos contornos do OSM

**Files:**

- Create: `src/lib/campus.ts`, `src/lib/osmBuildings.ts`, `src/lib/osmBuildings.test.ts`, `src/api/overpass.ts`
- Modify: `src/components/WorkerPositionsMap.tsx` (import `CAMPUS_BOUNDS_LATLNG` from `@/lib/campus`)

**Interfaces:**

- Produces:
  - `campus.ts`: `export const CAMPUS_BBOX = { south: -7.218, west: -35.913, north: -7.211, east: -35.9045 } as const;`
  - `osmBuildings.ts`: `export interface GeoPolygon { type: "Polygon"; coordinates: [number, number][][] }`; `export interface OsmBuilding { osmWayId: number; name: string | null; footprint: GeoPolygon }`; `export function buildOverpassQuery(bbox: typeof CAMPUS_BBOX): string`; `export function parseOverpassBuildings(response: unknown): OsmBuilding[]`.
  - `overpass.ts`: `export async function fetchCampusBuildings(fetchImpl: typeof fetch = fetch): Promise<OsmBuilding[]>`.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/osmBuildings.test.ts
import { describe, expect, it } from "vitest";

import { CAMPUS_BBOX } from "@/lib/campus";
import { buildOverpassQuery, parseOverpassBuildings } from "@/lib/osmBuildings";

const RING = [
  { lat: -7.214, lon: -35.909 },
  { lat: -7.214, lon: -35.908 },
  { lat: -7.215, lon: -35.908 },
  { lat: -7.214, lon: -35.909 },
];

describe("buildOverpassQuery", () => {
  it("asks for building ways inside the campus box with their geometry", () => {
    const query = buildOverpassQuery(CAMPUS_BBOX);

    expect(query).toContain('way["building"](-7.218,-35.913,-7.211,-35.9045)');
    expect(query).toContain("out geom");
  });
});

describe("parseOverpassBuildings", () => {
  it("turns each closed building way into a GeoJSON polygon with lon/lat order", () => {
    const [building] = parseOverpassBuildings({
      elements: [{ type: "way", id: 42, tags: { name: "Bloco CD (UFCG)" }, geometry: RING }],
    });

    expect(building?.osmWayId).toBe(42);
    expect(building?.name).toBe("Bloco CD (UFCG)");
    expect(building?.footprint.coordinates[0]?.[0]).toEqual([-35.909, -7.214]);
  });

  it("drops relations, ways without geometry, open rings and oversized rings", () => {
    const open = RING.slice(0, 3);
    const huge = Array.from({ length: 501 }, () => RING[0]);

    const buildings = parseOverpassBuildings({
      elements: [
        { type: "relation", id: 1, tags: {} },
        { type: "way", id: 2, tags: {} },
        { type: "way", id: 3, tags: {}, geometry: open },
        { type: "way", id: 4, tags: {}, geometry: huge },
        { type: "way", id: 5, tags: {}, geometry: RING },
      ],
    });

    expect(buildings.map((building) => building.osmWayId)).toEqual([5]);
  });

  it("returns an empty list for a response that is not an Overpass payload", () => {
    expect(parseOverpassBuildings(null)).toEqual([]);
    expect(parseOverpassBuildings({ elements: "x" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/osmBuildings.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/campus.ts
/** UFCG, campus Campina Grande: the box every map of the dashboard is framed on and the area
 * the OSM building import searches (infra/osm/bbox.env is not in the repository). */
export const CAMPUS_BBOX = { south: -7.218, west: -35.913, north: -7.211, east: -35.9045 } as const;

export type CampusBox = typeof CAMPUS_BBOX;
```

```ts
// src/lib/osmBuildings.ts
import type { CampusBox } from "@/lib/campus";

export interface GeoPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface OsmBuilding {
  osmWayId: number;
  name: string | null;
  footprint: GeoPolygon;
}

// Same limits the backend enforces (app/domain/catalog/footprint.py).
const MIN_POSITIONS = 4;
const MAX_POSITIONS = 500;

/** Overpass QL for every building way inside the box, with inline geometry.
 * @example buildOverpassQuery(CAMPUS_BBOX) */
export function buildOverpassQuery(box: CampusBox): string {
  const bbox = `${String(box.south)},${String(box.west)},${String(box.north)},${String(box.east)}`;

  return `[out:json][timeout:25];way["building"](${bbox});out geom;`;
}

interface OverpassNode {
  lat: number;
  lon: number;
}

function isNode(value: unknown): value is OverpassNode {
  const node = value as Partial<OverpassNode> | null;

  return typeof node?.lat === "number" && typeof node.lon === "number";
}

function toRing(geometry: unknown): [number, number][] | null {
  if (!Array.isArray(geometry) || !geometry.every(isNode)) {
    return null;
  }
  const ring = geometry.map((node): [number, number] => [node.lon, node.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed =
    first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];

  return closed && ring.length >= MIN_POSITIONS && ring.length <= MAX_POSITIONS ? ring : null;
}

function toBuilding(element: unknown): OsmBuilding | null {
  const way = element as {
    type?: unknown;
    id?: unknown;
    tags?: { name?: unknown };
    geometry?: unknown;
  };
  if (way.type !== "way" || typeof way.id !== "number") {
    return null;
  }
  const ring = toRing(way.geometry);
  if (ring === null) {
    return null;
  }
  const name = typeof way.tags?.name === "string" ? way.tags.name : null;

  return { osmWayId: way.id, name, footprint: { type: "Polygon", coordinates: [ring] } };
}

/** Building outlines from an Overpass `out geom` response; anything the map or the backend
 * could not use is dropped. @example parseOverpassBuildings(await response.json()) */
export function parseOverpassBuildings(response: unknown): OsmBuilding[] {
  const elements = (response as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) {
    return [];
  }

  return elements.map(toBuilding).filter((building): building is OsmBuilding => building !== null);
}
```

```ts
// src/api/overpass.ts
import { CAMPUS_BBOX } from "@/lib/campus";
import { buildOverpassQuery, type OsmBuilding, parseOverpassBuildings } from "@/lib/osmBuildings";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Building outlines on campus from the public Overpass API. `fetchImpl` is the test seam.
 * @example await fetchCampusBuildings() */
export async function fetchCampusBuildings(
  fetchImpl: typeof fetch = fetch,
): Promise<OsmBuilding[]> {
  const response = await fetchImpl(OVERPASS_URL, {
    method: "POST",
    body: new URLSearchParams({ data: buildOverpassQuery(CAMPUS_BBOX) }),
  });
  if (!response.ok) {
    throw new Error(
      `Overpass request failed with status ${String(response.status)}; expected 200 with building ways.`,
    );
  }

  return parseOverpassBuildings(await response.json());
}
```

In `WorkerPositionsMap.tsx`, replace the literal bounds with
`L.latLngBounds([CAMPUS_BBOX.south, CAMPUS_BBOX.west], [CAMPUS_BBOX.north, CAMPUS_BBOX.east])`.

- [ ] **Step 4: Run** — `npx vitest run src/lib/osmBuildings.test.ts src/components/WorkerPositionsMap.test.tsx` → PASS.
- [ ] **Step 5: Validate** — format/lint/typecheck. Stop for review.

---

### Task 5: Painel — vincular o contorno na página de Andares e selo na lista de Prédios

**Files:**

- Create: `src/components/buildings/FootprintPickerMap.tsx`, `src/components/buildings/BuildingFootprintSection.tsx`, `src/components/buildings/BuildingFootprintSection.test.tsx`
- Modify: `src/routes/FloorsPage.tsx` (render the section after the header), `src/routes/BuildingsPage.tsx` (badge), `src/i18n/strings.ts`

**Interfaces:**

- Consumes: `fetchCampusBuildings`, `OsmBuilding`, `GeoPolygon` (Task 4); API types (Task 3).
- Produces:
  - `FootprintPickerMap({ candidates: OsmBuilding[]; linked: GeoPolygon | null; selectedWayId: number | null; linkedElsewhere: Map<number, string>; onPick: (wayId: number) => void })`.
  - `BuildingFootprintSection({ buildingId: string; fetchOsm?: () => Promise<OsmBuilding[]> })` — `fetchOsm` defaults to `() => fetchCampusBuildings()`; tests pass a fake.

- [ ] **Step 1: Strings** — add to `strings.ts`:

```ts
  footprintSectionTitle: "Contorno no mapa",
  footprintLoading: "Carregando contornos do OpenStreetMap…",
  footprintOsmError: "Não foi possível carregar os contornos do OpenStreetMap. Tente novamente.",
  footprintRetry: "Tentar novamente",
  footprintPickHint: "Clique no contorno do prédio no mapa.",
  footprintPicked: "Contorno selecionado: {name}",
  footprintUnnamed: "Prédio sem nome no OpenStreetMap",
  footprintLink: "Vincular a este prédio",
  footprintReplace: "Trocar contorno",
  footprintRemove: "Remover contorno",
  footprintRemoveConfirm: "Remover o contorno deste prédio do mapa?",
  footprintSaveError: "Não foi possível salvar o contorno: {reason}",
  footprintLinkedElsewhere: "Já vinculado a {building}",
  footprintBadgeLinked: "Contorno vinculado",
  footprintBadgeMissing: "Sem contorno",
  footprintMapLabel: "Mapa para escolher o contorno do prédio",
```

- [ ] **Step 2: Write failing tests**

```tsx
// src/components/buildings/BuildingFootprintSection.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { BuildingFootprintSection } from "@/components/buildings/BuildingFootprintSection";
import type { OsmBuilding } from "@/lib/osmBuildings";

const OSM: OsmBuilding[] = [
  {
    osmWayId: 42,
    name: "Bloco CD (UFCG)",
    footprint: {
      type: "Polygon",
      coordinates: [
        [
          [-35.909, -7.214],
          [-35.908, -7.214],
          [-35.908, -7.215],
          [-35.909, -7.214],
        ],
      ],
    },
  },
];

function building(footprint: unknown = null) {
  return {
    id: "b1",
    name: "Bloco CD",
    campus_area: "CEEI",
    footprint,
    footprint_source: null,
    osm_way_id: null,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function renderSection(fakeFetch: typeof fetch, fetchOsm: () => Promise<OsmBuilding[]>) {
  vi.stubGlobal("fetch", fakeFetch);
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({ accessToken: "t", refreshToken: "r", role: "MANAGER" }),
  );

  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider>
        <BuildingFootprintSection buildingId="b1" fetchOsm={fetchOsm} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("BuildingFootprintSection", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("links the picked OSM outline to the building with a PUT", async () => {
    const fakeFetch = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            requestUrl(input).endsWith("/footprint") ? building(OSM[0]?.footprint) : [building()],
          ),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderSection(fakeFetch, () => Promise.resolve(OSM));

    await user.click(await screen.findByRole("button", { name: "Bloco CD (UFCG)" }));
    await user.click(screen.getByRole("button", { name: "Vincular a este prédio" }));

    await waitFor(() => {
      const put = fakeFetch.mock.calls.find(
        ([input]) => input instanceof Request && input.method === "PUT",
      );
      expect(put).toBeDefined();
    });
  });

  it("explains an OSM outage and offers a retry", async () => {
    const fakeFetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify([building()]), { status: 200 })),
    );
    renderSection(fakeFetch, () => Promise.reject(new Error("offline")));

    expect(await screen.findByText(/Não foi possível carregar os contornos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("removes a linked outline after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fakeFetch = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            requestUrl(input).endsWith("/footprint") ? building() : [building(OSM[0]?.footprint)],
          ),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderSection(fakeFetch, () => Promise.resolve(OSM));

    await user.click(await screen.findByRole("button", { name: "Remover contorno" }));

    await waitFor(() => {
      const del = fakeFetch.mock.calls.find(
        ([input]) => input instanceof Request && input.method === "DELETE",
      );
      expect(del).toBeDefined();
    });
  });
});
```

Note on picking in jsdom: polygons are SVG paths without accessible names, so the picker also renders an accessible list of the OSM candidates as buttons (visually a compact "Prédios encontrados" list beside the map, useful on keyboard too). Clicking either the polygon or the list button calls `onPick`.

- [ ] **Step 3: Run** — `npx vitest run src/components/buildings` → FAIL (module not found).

- [ ] **Step 4: Implement `FootprintPickerMap`** — a Leaflet map like `WorkerPositionsMap` (same `CAMPUS_BBOX` framing, minimum zoom on campus, `maxZoom: 19`, pan limit applied after sizing), drawing each candidate as `L.polygon(ring.map(([lon, lat]) => [lat, lon]))` with style `{ color: "#6b7079", weight: 1, fillOpacity: 0.15 }`, the selected one `{ color: "#14213d", weight: 3, fillOpacity: 0.35 }`, the linked footprint `{ color: "#14213d", weight: 2, dashArray: undefined, fillColor: "#14213d", fillOpacity: 0.25 }`; tooltip = OSM name or `footprintUnnamed`, plus `· Já vinculado a X` when in `linkedElsewhere`; `click` → `onPick(osmWayId)`. Next to the map, a `<ul aria-label="Prédios encontrados">` with one `<button>` per named candidate (name as accessible name).

- [ ] **Step 5: Implement `BuildingFootprintSection`**

```tsx
// key parts; full component in src/components/buildings/BuildingFootprintSection.tsx
export function BuildingFootprintSection({
  buildingId,
  fetchOsm = () => fetchCampusBuildings(),
}: Props) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const [selectedWayId, setSelectedWayId] = useState<number | null>(null);

  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: async () => (await client.GET("/buildings")).data ?? [],
  });
  const osm = useQuery({
    queryKey: ["osm-campus-buildings"],
    queryFn: fetchOsm,
    staleTime: Infinity,
  });
  const current = buildings.data?.find((building) => building.id === buildingId);
  const selected = osm.data?.find((candidate) => candidate.osmWayId === selectedWayId) ?? null;

  const save = useMutation({
    mutationFn: async (candidate: OsmBuilding) => {
      const { response, error } = await client.PUT("/buildings/{building_id}/footprint", {
        params: { path: { building_id: buildingId } },
        body: { footprint: candidate.footprint, osm_way_id: candidate.osmWayId },
      });
      if (!response.ok) {
        throw new Error(JSON.stringify(error ?? response.status));
      }
    },
    onSuccess: () => {
      setSelectedWayId(null);
      void queryClient.invalidateQueries({ queryKey: ["buildings"] });
    },
  });
  // remove: same shape with client.DELETE and window.confirm(t("footprintRemoveConfirm")).
  // linkedElsewhere: Map from osm_way_id to building name for every *other* building.
  // Render: Section titled footprintSectionTitle; loading/error (ErrorMessage + retry → osm.refetch());
  // FootprintPickerMap; hint or "Contorno selecionado: …" with the link/replace button;
  // "Remover contorno" when current?.footprint; save/remove errors via footprintSaveError.
}
```

Write the full component following the key parts above, splitting render helpers so each function stays under 20 lines.

- [ ] **Step 6: Wire the page and the badge** — in `FloorsPage.tsx`, render `<BuildingFootprintSection buildingId={buildingId ?? ""} />` between `PageHeader` and the floors `RegistryLayout`. In `BuildingsPage.tsx`, inside each row, add `<Badge variant={building.footprint ? "done" : "pending"}>{t(building.footprint ? "footprintBadgeLinked" : "footprintBadgeMissing")}</Badge>` and extend `BuildingRow` with `footprint: unknown`.

- [ ] **Step 7: Run** — `npx vitest run src/components/buildings src/routes/FloorsPage.test.tsx src/routes/BuildingsPage.test.tsx` → PASS. Validate. Stop for review.

---

### Task 6: Painel — lógica do interior do prédio (envoltória e situação dos pontos)

**Files:**

- Create: `src/lib/buildingInterior.ts`, `src/lib/buildingInterior.test.ts`

**Interfaces:**

- Consumes: `GeoPolygon` (Task 4); `RouteOut` and `BoardSnapshot` types.
- Produces:
  - `export function convexHull(points: [number, number][]): [number, number][] | null` — returns a closed ring (`[lon, lat]`, first = last) or `null` for < 3 distinct points.
  - `export type PointVisitStatus = "LATE" | "IN_PROGRESS" | "PENDING" | "DONE" | "NOT_SCHEDULED";`
  - `export function pointStatusesForToday(routes: RouteOut[], delayedRouteIds: Set<string>): Map<string, PointVisitStatus>` — keyed by `service_point_id`; most urgent wins.
  - `export function summarisePoints(statuses: PointVisitStatus[]): { total: number; done: number; late: number }`.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/buildingInterior.test.ts
import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import { convexHull, pointStatusesForToday, summarisePoints } from "@/lib/buildingInterior";

type RouteOut = components["schemas"]["RouteOut"];

function route(id: string, stops: [string, string][]): RouteOut {
  return {
    id,
    status: "IN_PROGRESS",
    stops: stops.map(([pointId, status], index) => ({
      id: `${id}-${String(index)}`,
      order_index: index + 1,
      status,
      service_point_id: pointId,
    })),
  } as unknown as RouteOut;
}

describe("convexHull", () => {
  it("wraps the outer points in a closed ring and ignores the inner ones", () => {
    const ring = convexHull([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [1, 1],
    ]);

    expect(ring).toHaveLength(5);
    expect(ring?.[0]).toEqual(ring?.[4]);
    expect(ring).not.toContainEqual([1, 1]);
  });

  it("returns null with fewer than three distinct points", () => {
    expect(
      convexHull([
        [0, 0],
        [0, 0],
        [1, 1],
      ]),
    ).toBeNull();
  });
});

describe("pointStatusesForToday", () => {
  it("marks the current stop of a delayed route as late", () => {
    const statuses = pointStatusesForToday(
      [
        route("r1", [
          ["p1", "DONE"],
          ["p2", "PENDING"],
        ]),
      ],
      new Set(["r1"]),
    );

    expect(statuses.get("p1")).toBe("DONE");
    expect(statuses.get("p2")).toBe("LATE");
  });

  it("keeps the most urgent status when two routes visit the same point", () => {
    const statuses = pointStatusesForToday(
      [route("r1", [["p1", "DONE"]]), route("r2", [["p1", "IN_PROGRESS"]])],
      new Set(),
    );

    expect(statuses.get("p1")).toBe("IN_PROGRESS");
  });
});

describe("summarisePoints", () => {
  it("counts points, done and late", () => {
    expect(summarisePoints(["DONE", "LATE", "PENDING", "NOT_SCHEDULED"])).toEqual({
      total: 4,
      done: 1,
      late: 1,
    });
  });
});
```

- [ ] **Step 2: Run** — FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/buildingInterior.ts
import type { components } from "@/api/generated/schema";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];
type Ring = [number, number][];

export type PointVisitStatus = "LATE" | "IN_PROGRESS" | "PENDING" | "DONE" | "NOT_SCHEDULED";

// Lower = more urgent; when two routes visit one point the panel shows the more urgent one.
const URGENCY: Record<PointVisitStatus, number> = {
  LATE: 0,
  IN_PROGRESS: 1,
  PENDING: 2,
  DONE: 3,
  NOT_SCHEDULED: 4,
};

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function halfHull(points: Ring): Ring {
  const hull: Ring = [];
  for (const point of points) {
    while (
      hull.length >= 2 &&
      cross(
        hull[hull.length - 2] as [number, number],
        hull[hull.length - 1] as [number, number],
        point,
      ) <= 0
    ) {
      hull.pop();
    }
    hull.push(point);
  }
  hull.pop();

  return hull;
}

/** Monotone-chain convex hull as a closed GeoJSON ring; null below three distinct points.
 * @example convexHull(points.map((p) => [p.longitude, p.latitude])) */
export function convexHull(points: Ring): Ring | null {
  const unique = [...new Map(points.map((p) => [`${String(p[0])},${String(p[1])}`, p])).values()];
  if (unique.length < 3) {
    return null;
  }
  const sorted = unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const hull = [...halfHull(sorted), ...halfHull([...sorted].reverse())];
  if (hull.length < 3) {
    return null;
  }

  return [...hull, hull[0] as [number, number]];
}

function stopVisitStatus(route: RouteOut, stopIndex: number, delayed: boolean): PointVisitStatus {
  const status = toStopStatus(route.stops[stopIndex]?.status ?? "PENDING");
  const currentIndex = route.stops.findIndex((stop) => toStopStatus(stop.status) !== "DONE");
  if (delayed && stopIndex === currentIndex) {
    return "LATE";
  }

  return status;
}

/** Today's status per service point, from the day's routes; the most urgent visit wins.
 * @example pointStatusesForToday(dayRoutes, delayedRouteIds).get(pointId) */
export function pointStatusesForToday(
  routes: RouteOut[],
  delayedRouteIds: Set<string>,
): Map<string, PointVisitStatus> {
  const statuses = new Map<string, PointVisitStatus>();
  for (const route of routes.filter((candidate) => candidate.status !== "CANCELLED")) {
    route.stops.forEach((stop, index) => {
      const next = stopVisitStatus(route, index, delayedRouteIds.has(route.id));
      const previous = statuses.get(stop.service_point_id);
      if (previous === undefined || URGENCY[next] < URGENCY[previous]) {
        statuses.set(stop.service_point_id, next);
      }
    });
  }

  return statuses;
}

/** Header numbers of the building panel. @example summarisePoints([...statuses.values()]) */
export function summarisePoints(statuses: PointVisitStatus[]) {
  return {
    total: statuses.length,
    done: statuses.filter((status) => status === "DONE").length,
    late: statuses.filter((status) => status === "LATE").length,
  };
}
```

- [ ] **Step 4: Run** — `npx vitest run src/lib/buildingInterior.test.ts` → PASS. Validate. Stop for review.

---

### Task 7: Painel — prédios no mapa da operação (desenho, clique, zoom)

**Files:**

- Create: `src/components/board/BuildingsLayer.ts`
- Modify: `src/components/WorkerPositionsMap.tsx`, `src/components/board/OperationsMapPanel.tsx`, `src/i18n/strings.ts`
- Test: `src/components/WorkerPositionsMap.test.tsx`

**Interfaces:**

- Consumes: `GeoPolygon`, `convexHull` (Tasks 4, 6).
- Produces:
  - `export interface MapBuilding { id: string; name: string; outline: [number, number][]; approximate: boolean }` (outline in `[lon, lat]`, closed).
  - `WorkerPositionsMap` new props: `buildings?: MapBuilding[]; selectedBuildingId?: string | null; onSelectBuilding?: (buildingId: string | null) => void; servicePoints?: MapServicePoint[]; selectedPointId?: string | null; onSelectPoint?: (pointId: string) => void;` where `MapServicePoint = { id: string; name: string; latitude: number; longitude: number; status: PointVisitStatus }`.
  - `export function mapBuildingsFrom(buildings: BuildingOut[], pointsByBuilding: Map<string, [number, number][]>): MapBuilding[]` in `BuildingsLayer.ts` (OSM footprint, else hull, else omitted).

- [ ] **Step 1: Strings**

```ts
  boardMapBuildingAria: "Prédio {name}",
  boardMapLegendBuilding: "Prédio",
  boardMapLegendApproximate: "Área aproximada (pelos pontos)",
  boardMapBuildingsHiddenHint: "Prédios sem contorno e com menos de 3 pontos não aparecem no mapa.",
```

- [ ] **Step 2: Write failing tests** (append to `WorkerPositionsMap.test.tsx`)

```tsx
const BUILDING = {
  id: "b1",
  name: "Bloco CD",
  approximate: false,
  outline: [
    [-35.909, -7.214],
    [-35.908, -7.214],
    [-35.908, -7.215],
    [-35.909, -7.214],
  ] as [number, number][],
};

it("reports which building was clicked", () => {
  const picked: (string | null)[] = [];
  render(
    <WorkerPositionsMap
      positions={[]}
      buildings={[BUILDING]}
      onSelectBuilding={(id) => picked.push(id)}
    />,
  );

  const region = screen.getByRole("region", { name: /mapa das posições/i });
  const outline = region.querySelector(".leaflet-interactive");
  if (outline === null) {
    throw new Error(
      "expected the building outline to be drawn as an interactive shape; found none.",
    );
  }
  fireEvent.click(outline);

  expect(picked).toEqual(["b1"]);
});

it("names a selected building on the map", () => {
  render(<WorkerPositionsMap positions={[]} buildings={[BUILDING]} selectedBuildingId="b1" />);

  expect(screen.getByText("Bloco CD")).toBeInTheDocument();
});
```

And in a new `src/components/board/BuildingsLayer.test.ts`:

```ts
it("uses the OSM footprint, falls back to the point hull, and omits buildings it cannot outline", () => {
  const square: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ];
  const buildings = mapBuildingsFrom(
    [
      {
        id: "osm",
        name: "A",
        campus_area: "",
        footprint: { type: "Polygon", coordinates: [square] },
        footprint_source: "osm",
        osm_way_id: 1,
      },
      {
        id: "hull",
        name: "B",
        campus_area: "",
        footprint: null,
        footprint_source: null,
        osm_way_id: null,
      },
      {
        id: "none",
        name: "C",
        campus_area: "",
        footprint: null,
        footprint_source: null,
        osm_way_id: null,
      },
    ],
    new Map([
      [
        "hull",
        [
          [0, 0],
          [2, 0],
          [2, 2],
        ],
      ],
      ["none", [[0, 0]]],
    ]),
  );

  expect(buildings.map((b) => [b.id, b.approximate])).toEqual([
    ["osm", false],
    ["hull", true],
  ]);
});
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement**
  - `BuildingsLayer.ts`: `mapBuildingsFrom` (narrow `footprint` with a type guard `isGeoPolygon(value): value is GeoPolygon`), and `drawBuildings(layer: L.LayerGroup, buildings: MapBuilding[], selectedId: string | null, onSelect: (id: string) => void): Map<string, L.Polygon>` drawing `L.polygon(outline.map(([lon, lat]) => [lat, lon]), style)` where style = selected `{ color: "#14213d", weight: 3, fillColor: "#14213d", fillOpacity: 0.3 }`, other-while-selected `{ color: "#6b7079", weight: 1, fillOpacity: 0.05 }`, default `{ color: "#14213d", weight: 1.5, fillColor: "#14213d", fillOpacity: 0.12 }`, approximate adds `dashArray: "4 4"`; tooltip = name, permanent only when selected; `click` → `L.DomEvent.stopPropagation(event); onSelect(id)`.
  - `WorkerPositionsMap.tsx`: a `buildingsRef` layer group added **before** the worker markers layer (so workers draw on top); an effect redrawing it on `[buildings, selectedBuildingId]`; when `selectedBuildingId` changes to a non-null id, `glideToBounds(map, polygon.getBounds())` with the same reduced-motion rule as `glideTo` (`map.flyToBounds(bounds, { padding: [24, 24], duration: 0.8 })`); map `click` (on empty map) → `onSelectBuilding?.(null)`. A third layer for `servicePoints` drawn as `L.marker` with `L.divIcon({ className: "", html: <square span>, iconSize: [14, 14] })` coloured by status (DONE `#23683f`, IN_PROGRESS `#8a5a00`, LATE `#b3261e`, PENDING `#6b7079`, NOT_SCHEDULED white with `#6b7079` border), tooltip = name (permanent if selected), `click` → `onSelectPoint`.
  - `OperationsMapPanel.tsx`: pass the new props through; legend adds "Prédio" and "Área aproximada", plus the hidden-buildings hint as small text.

- [ ] **Step 5: Run** — `npx vitest run src/components/WorkerPositionsMap.test.tsx src/components/board` → PASS. Validate. Stop for review.

---

### Task 8: Painel — painel do prédio e integração no quadro

**Files:**

- Create: `src/components/board/useBuildingInterior.ts`, `src/components/board/BuildingPanel.tsx`, `src/components/board/BuildingPanel.test.tsx`
- Modify: `src/routes/RouteBoardPage.tsx`, `src/i18n/strings.ts`, `src/routes/RouteBoardPage.test.tsx`

**Interfaces:**

- Consumes: Tasks 6–7 (`pointStatusesForToday`, `summarisePoints`, `MapBuilding`, `MapServicePoint`, new map props).
- Produces:
  - `useBuildingInterior(buildingId: string | null): { floors: FloorOut[] | undefined; pointsByFloor: Map<string, ServicePointOut[]>; isLoading: boolean; isError: boolean }` — `GET /floors?building_id=` then `GET /service-points?floor_id=` per floor (React Query `useQueries`), disabled when `buildingId` is null.
  - `BuildingPanel({ building: { id: string; name: string; campusArea: string }; floors; pointsByFloor; statuses: Map<string, PointVisitStatus>; selectedFloorId: string | "all"; onSelectFloor; selectedPointId; onSelectPoint; onClose; isLoading; isError })`.

- [ ] **Step 1: Strings**

```ts
  buildingPanelBack: "Voltar aos alertas",
  buildingPanelSummary: "{total} pontos · {done} feitos · {late} atrasados",
  buildingPanelAllFloors: "Todos",
  buildingPanelFloorsLabel: "Andares",
  buildingPanelNoFloors: "Nenhum andar cadastrado neste prédio.",
  buildingPanelNoPoints: "Nenhum ponto de serviço neste andar.",
  buildingPanelError: "Não foi possível carregar os andares e pontos deste prédio.",
  pointStatusLate: "Atrasado",
  pointStatusInProgress: "Em andamento",
  pointStatusPending: "Pendente",
  pointStatusDone: "Feito",
  pointStatusNotScheduled: "Sem visita hoje",
```

- [ ] **Step 2: Write failing tests**

```tsx
// src/components/board/BuildingPanel.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BuildingPanel } from "@/components/board/BuildingPanel";

const FLOORS = [
  { id: "f0", building_id: "b1", label: "Térreo" },
  { id: "f1", building_id: "b1", label: "1º andar" },
];
const POINTS = new Map([
  ["f0", [{ id: "p1", floor_id: "f0", name: "Banheiro térreo", latitude: -7.2, longitude: -35.9 }]],
  ["f1", [{ id: "p2", floor_id: "f1", name: "Sala 104", latitude: -7.2, longitude: -35.9 }]],
]);

function renderPanel(overrides: Partial<Parameters<typeof BuildingPanel>[0]> = {}) {
  const props = {
    building: { id: "b1", name: "Bloco CD", campusArea: "CEEI" },
    floors: FLOORS,
    pointsByFloor: POINTS,
    statuses: new Map([["p1", "LATE" as const]]),
    selectedFloorId: "all" as const,
    onSelectFloor: vi.fn(),
    selectedPointId: null,
    onSelectPoint: vi.fn(),
    onClose: vi.fn(),
    isLoading: false,
    isError: false,
    ...overrides,
  };
  render(<BuildingPanel {...props} />);

  return props;
}

describe("BuildingPanel", () => {
  it("summarises today and lists each point with its status", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "Bloco CD" })).toBeInTheDocument();
    expect(screen.getByText("2 pontos · 0 feitos · 1 atrasados")).toBeInTheDocument();
    expect(
      within(screen.getByRole("listitem", { name: /Banheiro térreo/ })).getByText("Atrasado"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("listitem", { name: /Sala 104/ })).getByText("Sem visita hoje"),
    ).toBeInTheDocument();
  });

  it("switches floor and highlights a point", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("tab", { name: "1º andar" }));
    await user.click(screen.getByRole("button", { name: /Banheiro térreo/ }));

    expect(props.onSelectFloor).toHaveBeenCalledWith("f1");
    expect(props.onSelectPoint).toHaveBeenCalledWith("p1");
  });

  it("goes back to the alerts with the back button or Escape", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("button", { name: "Voltar aos alertas" }));
    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("says when the building has no floors", () => {
    renderPanel({ floors: [], pointsByFloor: new Map() });

    expect(screen.getByText("Nenhum andar cadastrado neste prédio.")).toBeInTheDocument();
  });
});
```

In `RouteBoardPage.test.tsx`, add one integration test: with `/buildings` returning a building with footprint, `/floors?building_id=b1` returning one floor and `/service-points?floor_id=f0` returning one point, clicking the map's building outline (`.leaflet-interactive` inside the map region, same justification as the existing marker-click test) shows the building panel heading and hides "Alertas abertos"; clicking "Voltar aos alertas" brings "Alertas abertos" back.

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement**
  - `useBuildingInterior.ts` as specified.
  - `BuildingPanel.tsx`: same plate as `OpenAlertsPanel` (`bg-card rounded-md border`), header with back button (`ChevronLeft`), `h2` name, campus area, summary line; `role="tablist"` of floor buttons (`role="tab"`, `aria-selected`); `ul` of points, each `li` labelled by the point name, containing a `button` (name = point name) and a status `Badge` (`late`, `progress`, `pending`, `done`, `outline` for not scheduled); Escape handled with a `keydown` listener on `document` while mounted; loading/error/empty states with `LoadingMessage`/`ErrorMessage`/`EmptyState`.
  - `RouteBoardPage.tsx`: state `selectedBuildingId`, `selectedFloorId` (reset to `"all"` on building change), `selectedPointId`; queries `/buildings` and all `/service-points` (one call, `include_archived` false) to build `pointsByBuilding` via floors→building (from `useBuildingInterior` only for the open building; for the hull of every building use `GET /floors` once and group points by `floor.building_id`); `statuses = pointStatusesForToday(dayRoutes, delayedRouteIds)`; pass `buildings`, `servicePoints` (points of the open building filtered by floor, with status), selection props to `OperationsMapPanel`; render `BuildingPanel` instead of `OpenAlertsPanel` when a building is open.
  - Keep `RouteBoardPage.tsx` under 500 lines: move the new state and derived data into `src/components/board/useBoardBuildings.ts` returning `{ mapBuildings, openBuilding, panelProps, mapPointProps, selectBuilding }`.

- [ ] **Step 5: Run** — `npx vitest run src/components/board src/routes/RouteBoardPage.test.tsx` → PASS. Validate. Stop for review.

---

### Task 9: Verificação no navegador, documentação e checagem final

**Files:**

- Modify: `DESIGN.md`, `docs/superpowers/specs/2026-10-11-predios-no-mapa-design.md` (status → implementado)

- [ ] **Step 1: Mock data** — in the scratchpad mock server, add `footprint` to two buildings (real UFCG outlines are fine to copy from an Overpass response) and service points with floors, so the map shows one OSM outline, one approximate hull and the panel.
- [ ] **Step 2: Browser check** (headless Chrome via CDP, as done for the glide): click a building → map zooms to its bounds (zoom level increases, outline centred), panel heading = building name, square point markers present; switch floor → markers change; Esc → alerts back. On `/predios/b1/andares`: OSM outlines drawn (with a fake Overpass response served by the mock), pick + link → badge "Contorno vinculado" on `/predios`.
- [ ] **Step 3: DESIGN.md** — add "Prédios no mapa" (polygon styles, approximate dashed hull, square service-point markers, building panel) and the footprint section of the Andares page.
- [ ] **Step 4: Final checks** — backend: `uv run ruff check . && uv run ruff format --check . && uv run mypy app tests && uv run pytest`. Painel: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`; `impeccable detect --json src` → `[]`.
- [ ] **Step 5: Report** — summary in the shape of commit messages for both repos (no commit until the user asks).
