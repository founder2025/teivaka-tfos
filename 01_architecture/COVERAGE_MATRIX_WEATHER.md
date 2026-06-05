# Prototype V262 — Coverage Matrix · Module 17: WEATHER (#16) 🔒 (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreWeatherView` 10823, `openWeatherCenter`
> 9921). Hierarchy: Page → sections → components. Columns = implied requirement.
> No codebase comparison. Locked (🔒) nav item.

## Page identity
| Page | Route | Render fn | Structure |
|---|---|---|---|
| Weather | `/farm/weather` (locked) | `coreWeatherView` (+ `openWeatherCenter` modal) | forecast + impact + alerts (no tabs) |

## 1. Chrome + cyclone alert
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Cyclone alert banner | indicator | yes | `GET weather/alerts` | any |
| Open Weather Center (`openWeatherCenter`) | BTN/MOD | yes | `GET weather/detail` | any |

## 2. Forecast
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| 7-day forecast (rain / wind / humidity) | CHT | yes | `GET weather/forecast` | per-day |
| Monthly stats (rainfall / heavy-rain days / cyclone days) | KPI×3 | yes | `GET weather/month` | |

## 3. Operational impact
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Spray window (HOLD / GO) | indicator | yes | `GET weather/spray-window` | feeds WHD/spray timing |
| Activity impact matrix (Crop / Spray / Harvest / Plant) | SEC | yes | `GET weather/impact` | go/hold per activity |
| Per-block weather (→ `selectMapBlock`) | SEC | yes | `GET weather?block=` | block-level |
| Animals weather impact | SEC | yes | `GET weather/livestock-impact` | heat-stress |
| TIS weather suggestions (sparkles) | SEC | yes | `GET tis/suggestions?weather` | advisory |

## 4. Events / cross-links
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Logged weather events (WEATHER_OBSERVED/IMPACT) | list | yes | `GET events?type=weather` | audit-backed |
| Log weather event | BTN | yes | `POST events` WEATHER_OBSERVED | F/M/WORKER |
| Cross-links → Crops / Tasks / blocks | BTN | — | `navigateToFarmSub` | nav |

## 5. Weather Center modal (`openWeatherCenter`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Detailed weather center (extended forecast + history + alerts) | MOD | yes | `GET weather/detail` |

## 6. States / Permissions / Nav
| Item | Notes |
|---|---|
| Cyclone/heavy-rain alert (RED) | top-of-page |
| Spray HOLD blocks spray timing | operational |
| Empty: no forecast data | STATE |
| Locked feature (🔒) | access |
| Permissions: view any; log weather event = F/M/WORKER | inferred |

## 7. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| (weather) | tenant.weather_log + external forecast feed |

---

## Weather — COMPLETE coverage statement
**~20 objects** across chrome + cyclone alert, 7-day forecast, monthly stats, spray window (HOLD/GO), activity impact matrix, per-block + animals impact, TIS suggestions, logged weather events + log action, weather center modal, states, permissions, navigation, data. **Weather audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done = **16 / 20.** Remaining: Library, Gallery, Partnerships, Settings.
