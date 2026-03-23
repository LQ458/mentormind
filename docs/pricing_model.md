# MentorMind Production Pricing Model

## Objective
To outline a sustainable, scalable pricing structure for MentorMind's AI-generated educational content platform, balancing competitive accessibility for students with the computational costs of running FunASR, PaddleOCR, DeepSeek, and TTS models.

---

## 1. Unit Economics (Estimated Costs per Lesson)
Generating a 30-minute interactive lesson consumes varying resources depending on the media inputs:

| Service | Estimated Cost (per lesson) | Notes |
| :--- | :--- | :--- |
| **DeepSeek API (LLM)** | $0.02 - $0.05 | Knowledge graph, exercise generation, explanations |
| **Text-to-Speech (Edge)** | $0.00 | Free tier/local inference |
| **FunASR (Audio Ingest)**| $0.03 | Local inference compute time / Cloud API |
| **PaddleOCR (Images)** | $0.01 | Local inference compute time |
| **Database & Storage (S3)** | $0.01 | Storing lesson metadata, audio blobs, images |
| **Total Variable Cost** | **~$0.05 to $0.10** | **Per generated lesson** |

---

## 2. Subscription Tiers

We employ a freemium SaaS model to incentivize user adoption while rapidly monetizing power-users (teachers, aggressive learners).

### Tier 1: Free (Starter)
Designed for casual learners to experience the "Aha!" moment of conversational AI teaching.
* **Price:** $0 / month
* **Monthly Lesson Quota:** 5 AI-generated lessons
* **Features:**
  * Basic text-to-lesson generation
  * Standard TTS voices
  * Standard difficulty levels
* **Restrictions:**
  * No PDF/Audio/Image ingestion
  * Ad-supported (optional)

### Tier 2: Pro (Learner)
Designed for dedicated students and self-learners needing constant material.
* **Price:** $9.99 / month
* **Monthly Lesson Quota:** 60 AI-generated lessons (~2 per day)
* **Features:**
  * **Everything in Free**
  * Multi-modal ingestion (Upload PDFs, Images, Audio notes)
  * Priority queuing for AI generation pipeline
  * Premium, emotive Neural TTS voices
  * Ad-free experience

### Tier 3: Elite (Educator)
Designed for teachers, schools, or hyper-learners.
* **Price:** $24.99 / month
* **Monthly Lesson Quota:** 250 AI-generated lessons
* **Features:**
  * **Everything in Pro**
  * Export lessons to PDF/LMS formats
  * Lesson analytics and student performance tracking (for teachers)
  * Custom learning paths (Long-term curriculums)
  * Dedicated high-speed API instances

---

## 3. Pay-As-You-Go (Add-ons)
For users who exhaust their monthly quota but do not wish to upgrade their tier.
* **Refill Pack:** $4.99 for 20 additional lessons.
* *Why?* Prevents churn from users who occasionally spike in usage (e.g., during finals week).

---

## 4. Implementation Steps (Backend)

To implement this on the backend mapping to Clerk:
1. **Model Update:** Add `subscription_tier: "free" | "pro" | "elite"` and `monthly_lessons_used: int` to the `User` table.
2. **Webhook Sync:** Listen to Stripe/Paddle webhooks on the FastAPI backend to update the user's tier.
3. **Usage Middleware:** Intercept calls to `/create-class`. Increment `monthly_lessons_used`. If `monthly_lessons_used >= limit`, return `402 Payment Required`.
4. **Monthly Cron:** A Celery task resets `monthly_lessons_used` to 0 on the 1st of every month for active accounts.
