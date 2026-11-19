#!/usr/bin/env python3
"""Fetch a compact, city-scoped attraction index from the public Overpass API."""

import argparse
import json
import math
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "frontend" / "src" / "travel-map-osm-points.js"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "TripCoordinationDemo/1.0 (offline travel-map data build)"
TOURISM_VALUES = (
    "attraction|viewpoint|museum|gallery|theme_park|zoo|aquarium|"
    "artwork|planetarium"
)
HISTORIC_VALUES = "archaeological_site|castle|city_gate|fort|memorial|monument|ruins|temple"

# Seed with provincial-level administrative centers and commonly searched cities.
# Extend this list as needed; generated data is bundled and is not fetched at runtime.
CITIES = [
    ("北京", 39.9042, 116.4074, 8), ("天津", 39.0842, 117.2010, 4),
    ("石家庄", 38.0428, 114.5149, 2), ("太原", 37.8706, 112.5489, 2),
    ("呼和浩特", 40.8426, 111.7492, 2), ("沈阳", 41.8057, 123.4315, 4),
    ("长春", 43.8171, 125.3235, 2), ("哈尔滨", 45.8038, 126.5350, 4),
    ("上海", 31.2304, 121.4737, 8), ("南京", 32.0603, 118.7969, 8),
    ("杭州", 30.2741, 120.1551, 8), ("合肥", 31.8206, 117.2272, 2),
    ("福州", 26.0745, 119.2965, 2), ("南昌", 28.6820, 115.8579, 2),
    ("济南", 36.6512, 117.1201, 4), ("郑州", 34.7466, 113.6254, 4),
    ("武汉", 30.5928, 114.3055, 8), ("长沙", 28.2282, 112.9388, 4),
    ("广州", 23.1291, 113.2644, 8), ("南宁", 22.8170, 108.3665, 2),
    ("海口", 20.0440, 110.1999, 2), ("重庆", 29.5630, 106.5516, 8),
    ("成都", 30.5728, 104.0668, 8), ("贵阳", 26.6470, 106.6302, 2),
    ("昆明", 25.0389, 102.7183, 4), ("拉萨", 29.6520, 91.1721, 2),
    ("西安", 34.3416, 108.9398, 8), ("兰州", 36.0611, 103.8343, 2),
    ("西宁", 36.6171, 101.7782, 2), ("银川", 38.4872, 106.2309, 2),
    ("乌鲁木齐", 43.8256, 87.6168, 2), ("香港", 22.3193, 114.1694, 4),
    ("澳门", 22.1987, 113.5439, 2), ("台北", 25.0330, 121.5654, 4),
    ("深圳", 22.5431, 114.0579, 8), ("大连", 38.9140, 121.6147, 4),
    ("青岛", 36.0671, 120.3826, 4), ("厦门", 24.4798, 118.0894, 4),
    ("三亚", 18.2528, 109.5119, 4), ("桂林", 25.2736, 110.2900, 4),
    ("张家界", 29.1171, 110.4792, 4), ("苏州", 31.2989, 120.5853, 8),
]


def localized_name(tags):
    return (
        tags.get("name:zh-Hans")
        or tags.get("name:zh")
        or tags.get("name")
        or tags.get("official_name")
        or ""
    ).strip()


def candidate_score(tags):
    score = 20 if tags.get("tourism") == "attraction" else 10
    if tags.get("wikipedia") or tags.get("wikidata"):
        score += 20
    if tags.get("website") or tags.get("image"):
        score += 5
    if tags.get("historic") in {"monument", "archaeological_site", "castle", "temple"}:
        score += 5
    return score


def make_query(cities, radius=22000):
    circles = "".join(
        f'nwr(around:{radius},{city[1]},{city[2]})["name"]["tourism"~"{TOURISM_VALUES}"];'
        f'nwr(around:{radius},{city[1]},{city[2]})["name"]["historic"~"{HISTORIC_VALUES}"];'
        for city in cities
    )
    return (
        f'[out:json][timeout:120];({circles});out center tags;'
    )


def point_coordinates(element):
    if element.get("type") == "node":
        return element.get("lat"), element.get("lon")
    center = element.get("center", {})
    return center.get("lat"), center.get("lon")


def distance_km(lat1, lon1, lat2, lon2):
    lat1, lat2 = math.radians(lat1), math.radians(lat2)
    delta_lat = lat2 - lat1
    delta_lon = math.radians(lon2 - lon1)
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def fetch_cities(cities, endpoint=OVERPASS_URL, timeout=90, radius=22000):
    query = make_query(cities, radius)
    request = Request(
        f"{endpoint}?{urlencode({'data': query})}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urlopen(request, timeout=timeout) as response:
        elements = json.load(response).get("elements", [])

    grouped = {city[0]: [] for city in cities}
    for element in elements:
        lat, lon = point_coordinates(element)
        if lat is None or lon is None:
            continue
        nearest_city = min(cities, key=lambda city: distance_km(lat, lon, city[1], city[2]))
        if distance_km(lat, lon, nearest_city[1], nearest_city[2]) <= 22:
            grouped[nearest_city[0]].append(element)
    return {city[0]: select_city_points(city, grouped[city[0]]) for city in cities}


def fetch_with_split(cities, endpoint, failures, radius):
    try:
        return fetch_cities(cities, endpoint, radius=radius)
    except Exception as error:
        if len(cities) == 1:
            failures.append((cities[0][0], str(error)))
            print(f"{cities[0][0]}: query failed ({error})", flush=True)
            return {}
        midpoint = len(cities) // 2
        time.sleep(2)
        return {
            **fetch_with_split(cities[:midpoint], endpoint, failures, radius),
            **fetch_with_split(cities[midpoint:], endpoint, failures, radius),
        }


def select_city_points(city, elements):
    name, _, _, limit = city
    candidates = []
    seen = set()
    for element in elements:
        tags = element.get("tags", {})
        title = localized_name(tags)
        if not title:
            continue
        normalized = re.sub(r"[\W_]+", "", title).lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        coordinates = point_coordinates(element)
        if any(value is None for value in coordinates):
            continue
        candidates.append({
            "score": candidate_score(tags),
            "point": {
                "id": f"osm-{element['type']}-{element['id']}",
                "name": title,
                "category": "景点",
                "city": name,
                "coordinates": [round(coordinates[0], 6), round(coordinates[1], 6)],
                "detail": (tags.get("description:zh") or tags.get("description") or "OpenStreetMap 收录景点").strip()[:240],
                "area": f"{name} · 地图收录",
                "color": "#1687d5",
                "source": "OpenStreetMap",
            },
        })

    candidates.sort(key=lambda item: (-item["score"], item["point"]["name"], item["point"]["id"]))
    return [item["point"] for item in candidates[:limit]]


def write_module(output_path, points):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    source = (
        "// Data derived from OpenStreetMap, licensed under ODbL 1.0.\n"
        "export const travelMapOsmPoints = "
        + json.dumps(points, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
        "export const travelMapAttribution = "
        + json.dumps("景点数据 © OpenStreetMap contributors · ODbL", ensure_ascii=False)
        + ";\n"
    )
    output_path.write_text(source, encoding="utf-8")


def read_module_points(output_path):
    if not output_path.exists():
        return []
    source = output_path.read_text(encoding="utf-8")
    match = re.search(
        r"export const travelMapOsmPoints = (.*?);\s*export const travelMapAttribution",
        source,
        re.DOTALL,
    )
    return json.loads(match.group(1)) if match else []


def trim_points(points):
    limits = {city[0]: city[3] for city in CITIES}
    grouped = {}
    for point in points:
        grouped.setdefault(point["city"], []).append(point)
    return [
        point
        for city, city_points in grouped.items()
        for point in city_points[:limits.get(city, 2)]
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--delay", type=float, default=1.2, help="Seconds between city queries")
    parser.add_argument("--limit-cities", type=int, help="Optional cap for a small test run")
    parser.add_argument("--only-cities", nargs="+", help="Query only the named cities and merge results")
    parser.add_argument("--endpoint", default=OVERPASS_URL)
    parser.add_argument("--radius", type=int, default=22000, help="Search radius in meters")
    parser.add_argument("--trim-existing", action="store_true", help="Apply current per-city limits without querying")
    args = parser.parse_args()

    if args.trim_existing:
        points = trim_points(read_module_points(args.output))
        write_module(args.output, points)
        print(f"Trimmed to {len(points)} attractions in {len({point['city'] for point in points})} cities.")
        return

    cities = [city for city in CITIES if city[0] in args.only_cities] if args.only_cities else CITIES
    unknown_cities = set(args.only_cities or ()) - {city[0] for city in CITIES}
    if unknown_cities:
        parser.error(f"Unknown city names: {', '.join(sorted(unknown_cities))}")
    if args.limit_cities:
        cities = cities[:args.limit_cities]

    points = read_module_points(args.output) if args.only_cities else []
    failures = []
    batch_size = 3
    batches = [cities[index:index + batch_size] for index in range(0, len(cities), batch_size)]
    for index, batch in enumerate(batches):
        results = fetch_with_split(batch, args.endpoint, failures, args.radius)
        for city in batch:
            if city[0] in results:
                points = [point for point in points if point["city"] != city[0]]
                points.extend(results[city[0]])
                found = results[city[0]]
                print(f"{city[0]}: {len(found)} attractions", flush=True)
        if index + 1 < len(batches):
            time.sleep(args.delay)

    if not points:
        raise SystemExit("No attraction data returned; existing map data was left unchanged.")
    write_module(args.output, points)
    cities_written = len({point["city"] for point in points})
    print(f"Wrote {len(points)} attractions in {cities_written} cities to {args.output}", flush=True)
    if failures:
        print(f"{len(failures)} city queries failed; rerun to retry them.", file=sys.stderr)


if __name__ == "__main__":
    main()
