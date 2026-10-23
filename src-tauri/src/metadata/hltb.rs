use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HltbData {
    pub game_name: String,
    pub main_story_hours: f32,
    pub main_extra_hours: f32,
    pub completionist_hours: f32,
}

pub struct HltbFetcher;

impl HltbFetcher {
    pub async fn fetch_hltb(game_title: &str) -> Option<HltbData> {
        let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .ok()?;

        let now_millis = chrono::Utc::now().timestamp_millis();
        let init_url = format!("https://howlongtobeat.com/api/search/site/init?t={}", now_millis);

        let init_resp = client
            .get(&init_url)
            .header("User-Agent", ua)
            .header("Referer", "https://howlongtobeat.com/")
            .send()
            .await
            .ok()?;

        let init_json: Value = init_resp.json().await.ok()?;
        let token = init_json.get("token")?.as_str()?.to_string();

        let search_terms: Vec<&str> = game_title.split_whitespace().collect();

        let payload = serde_json::json!({
            "searchType": "games",
            "searchTerms": search_terms,
            "searchPage": 1,
            "size": 5,
            "searchOptions": {
                "games": {
                    "userId": 0,
                    "platform": "",
                    "sortCategory": "popular",
                    "rangeCategory": "main",
                    "rangeTime": { "min": null, "max": null },
                    "gameplay": { "perspective": "", "flow": "", "genre": "" },
                    "modifier": ""
                },
                "users": { "sortCategory": "postcount" },
                "lists": { "sortCategory": "follows" },
                "filter": "",
                "sort": 0,
                "randomizer": 0
            }
        });

        let search_resp = client
            .post("https://howlongtobeat.com/api/search/site")
            .header("Content-Type", "application/json")
            .header("x-auth-token", token)
            .header("Referer", "https://howlongtobeat.com/")
            .header("Origin", "https://howlongtobeat.com")
            .header("User-Agent", ua)
            .json(&payload)
            .send()
            .await
            .ok()?;

        let search_json: Value = search_resp.json().await.ok()?;
        let data_arr = search_json.get("data")?.as_array()?;
        let best_match = data_arr.first()?;

        let name = best_match.get("game_name")?.as_str()?.to_string();
        let comp_main = best_match.get("comp_main")?.as_f64().unwrap_or(0.0) / 3600.0;
        let comp_plus = best_match.get("comp_plus")?.as_f64().unwrap_or(0.0) / 3600.0;
        let comp_100 = best_match.get("comp_100")?.as_f64().unwrap_or(0.0) / 3600.0;

        Some(HltbData {
            game_name: name,
            main_story_hours: (comp_main * 10.0).round() as f32 / 10.0,
            main_extra_hours: (comp_plus * 10.0).round() as f32 / 10.0,
            completionist_hours: (comp_100 * 10.0).round() as f32 / 10.0,
        })
    }
}
