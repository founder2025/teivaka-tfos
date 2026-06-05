# Prototype V262 — Coverage Matrix · Module 23: CLASSROOM PILLAR (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`renderClassroom` 11407, `renderCourseCard`
> 11438). Hierarchy: Pillar → Sub-page (nav) → components. Columns = implied
> requirement. No codebase comparison. The learning / extension-education layer
> ("Open to everyone, everywhere.").

## Pillar identity
| Pillar | Nav sub-pages | Render fn |
|---|---|---|
| Classroom | Overview · Tracks · My progress · Certification · Bookmarks | `renderClassroom` |

## 1. Overview sub-page
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| `h1` "Classroom" + "Open to everyone, everywhere." | label | — | — | any |
| Course cards (`renderCourseCard`) | card×N | yes | `GET courses` | any |
| **New course** (`cbNewCourse`) | BTN | yes | `POST courses` | ADMIN/educator |
| Empty: "No courses yet." | STATE | — | — | — |

## 2. Tracks sub-page
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Learning tracks (grouped courses) → open (`openTrack`) | card | yes | `GET tracks` | enroll | any |
| Track detail → lessons | SEC | yes | `GET tracks/{id}` | — | any |
| Lesson (content + complete) | SEC+BTN | yes | `GET/POST lessons/{id}/complete` | progress | any |

## 3. My progress sub-page
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Progress bars per track/course | KPI | yes | `GET me/progress` | completion % |

## 4. Certification sub-page
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Certificates earned (award) + QR | card | yes | `GET me/certifications` | verifiable cert |
| Certificate detail / download | BTN | yes | `GET certifications/{id}` | PDF |

## 5. Bookmarks sub-page
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Bookmarked lessons/courses | list | yes | `GET me/bookmarks` |
| Bookmark/unbookmark | BTN | yes | `POST/DELETE bookmarks` |

## 6. States / Permissions / Nav
| Item | Notes |
|---|---|
| Empty: no courses/progress/certs/bookmarks | STATE |
| Permissions: learn = any; author course = ADMIN/educator | inferred |
| Course → track → lesson → complete → progress → certificate | flow |

## 7. Data (prototype mock → implied schema)
| Domain | Implied (classroom schema, migration 017b) |
|---|---|
| courses/tracks/lessons | classroom.* |
| progress/enrollment | enrollment + progress |
| certifications | course certifications |
| bookmarks | bookmarks |

---

## Classroom pillar — COMPLETE coverage statement
**~20 objects** across 5 sub-pages: Overview (course cards + new course), Tracks (tracks → lessons → complete), My progress (progress bars), Certification (certs + QR + download), Bookmarks. States, permissions, navigation, data (classroom schema). **Classroom pillar audit = 100%, prototype-only.**

## Audit progress
Farm nav 20/20 ✅ · Home ✅ · Classroom ✅. Remaining: TIS, Me/Profile, Auth, public Verify/Covenant, Control Room.
