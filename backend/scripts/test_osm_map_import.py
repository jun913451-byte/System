import importlib.util
import tempfile
import unittest
from pathlib import Path


script_path = Path(__file__).with_name("import-osm-attractions.py")
spec = importlib.util.spec_from_file_location("osm_map_import", script_path)
osm_map_import = importlib.util.module_from_spec(spec)
spec.loader.exec_module(osm_map_import)


class OSMMapImportTests(unittest.TestCase):
    def test_city_seeds_cover_provincial_centers_and_extra_destinations(self):
        names = {city[0] for city in osm_map_import.CITIES}
        self.assertTrue({"北京", "拉萨", "乌鲁木齐", "香港", "澳门", "台北"} <= names)
        self.assertTrue({"深圳", "大连", "青岛", "厦门", "三亚", "桂林", "张家界", "苏州"} <= names)

    def test_query_requests_tourism_and_historic_points_near_city(self):
        query = osm_map_import.make_query([("兰州", 36.0611, 103.8343, 4)])
        self.assertIn("around:22000,36.0611,103.8343", query)
        self.assertIn('["tourism"~"', query)
        self.assertIn('["historic"~"', query)

    def test_nearest_city_distance_uses_coordinates(self):
        self.assertLess(osm_map_import.distance_km(36.0611, 103.8343, 36.07, 103.84), 2)
        self.assertGreater(osm_map_import.distance_km(36.0611, 103.8343, 34.3416, 108.9398), 200)

    def test_candidate_scoring_uses_existing_osm_metadata_only(self):
        plain = osm_map_import.candidate_score({"tourism": "attraction"})
        enriched = osm_map_import.candidate_score({
            "tourism": "attraction",
            "wikidata": "Q123",
            "website": "https://example.test",
        })
        self.assertEqual(plain, 20)
        self.assertEqual(enriched, 45)

    def test_trim_uses_smaller_limits_for_regular_cities(self):
        points = [
            {"id": f"{city[0]}-{index}", "city": city[0]}
            for city in osm_map_import.CITIES[:3]
            for index in range(10)
        ]
        trimmed = osm_map_import.trim_points(points)
        counts = {}
        for point in trimmed:
            counts[point["city"]] = counts.get(point["city"], 0) + 1

        self.assertEqual(counts["北京"], 8)
        self.assertEqual(counts["天津"], 4)
        self.assertEqual(counts["石家庄"], 2)

    def test_selection_deduplicates_and_respects_city_cap(self):
        city = ("测试", 30, 120, 2)
        elements = [
            {"type": "node", "id": 1, "lat": 30.1, "lon": 120.1,
             "tags": {"name": "普通景点", "tourism": "attraction"}},
            {"type": "node", "id": 2, "lat": 30.2, "lon": 120.2,
             "tags": {"name": "重点景点", "tourism": "attraction", "wikidata": "Q1"}},
            {"type": "node", "id": 3, "lat": 30.3, "lon": 120.3,
             "tags": {"name": "重点景点", "tourism": "attraction", "wikidata": "Q2"}},
            {"type": "way", "id": 4, "center": {"lat": 30.4, "lon": 120.4},
             "tags": {"name": "另一个景点", "historic": "monument"}},
        ]

        result = osm_map_import.select_city_points(city, elements)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["name"], "重点景点")
        self.assertTrue(all(point["city"] == "测试" for point in result))

    def test_generated_module_can_be_read_for_city_only_merge(self):
        points = [{"id": "osm-node-1", "city": "兰州", "name": "景点"}]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "points.js"
            osm_map_import.write_module(output, points)
            self.assertEqual(osm_map_import.read_module_points(output), points)


if __name__ == "__main__":
    unittest.main()
