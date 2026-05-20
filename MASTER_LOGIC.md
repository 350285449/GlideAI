This is your **GlideAI Master Manifest**. It combines the technical architecture, the biomechanical math, and the "Vibe Coding" setup instructions into one clean, copyable file.

You can save this as `GLIDE_AI_MANIFEST.md` in your project root to keep Cursor aligned, or use it as your `README.md`.

---

# GlideAI: Institutional Aquatic Intelligence 🏊‍♂️
**Version:** 1.0.0-Beta
**Focus:** 2026 Privacy-Compliant Markerless Motion Capture
**Objective:** $20,000 Revenue Target (Summer 2026)

---

## 1. Project Vision
GlideAI is a B2B aquatic technology platform designed to bridge the **"Intermediate Plateau"** for fitness swimmers and triathletes. By delivering elite-level biomechanical feedback via a privacy-first, on-device AI engine, we provide the "Intel Inside" for high-end swim clubs and triathlon groups.

---

## 2. Technical Stack
* **Framework:** Next.js 15 (App Router)
* **Styling:** Tailwind CSS (Theme: Pro-Sport Dark)
* **Vision Engine:** MediaPipe Pose (WASM-based)
* **Rendering:** React-Webcam + HTML5 Canvas
* **Deployment:** Vercel (Edge-optimized)
* **Privacy:** 100% Client-Side Processing (Localhost/WASM)

---

## 3. Biomechanical Logic (EVF Detection)
The core "Moat" of GlideAI is the automated detection of the **Early Vertical Forearm (EVF)**.

### The Mathematics of the Catch
To calculate the EVF state, we track three primary landmarks:
* $S$ = Shoulder Landmark (11 or 12)
* $E$ = Elbow Landmark (13 or 14)
* $W$ = Wrist Landmark (15 or 16)

**Logic Constraints:**
1.  **Internal Angle:** $\angle SEW$ must be between $100^\circ$ and $120^\circ$ during the high-catch phase.
2.  **Verticality:** The vector $\vec{EW}$ must be $> 70^\circ$ relative to the water surface (horizontal plane).
3.  **Phase Gating:** Trigger detection only when the wrist Y-coordinate is in the top 30% of the total stroke depth.

---

## 4. Cursor Setup & Initialization

### Project Configuration (`.cursorrules`)
Paste this into your `.cursorrules` file:
```text
- Expert Full-Stack Engineer role.
- Focus: MediaPipe WASM integration & Biomechanical Math.
- Privacy: 0% data upload. All analysis must be client-side.
- UI: Use 'Lucide-React' icons. Maintain a dark, high-performance aesthetic.
- Logic: Implement 'Continuous Motion Prediction' (CMP) to handle water splash occlusions.
```

### Required Dependencies
```bash
npm install @mediapipe/pose @mediapipe/camera_utils react-webcam lucide-react
```

---

## 5. The Master Composer Prompt
**Copy and paste this into Cursor Composer (`Cmd + I`) once your dependencies are installed:**

> "Generate the core `PoseAnalyzer.tsx` component for GlideAI.
> 1. Use `react-webcam` to mirror the user's feed.
> 2. Initialize `@mediapipe/pose` using the WASM runtime from JSDelivr.
> 3. Draw a skeletal overlay on a high-z-index `<canvas>`.
> 4. Implement a `checkEVF()` function using the Landmark coordinates for Shoulder, Elbow, and Wrist.
> 5. If the elbow angle is optimized for an Early Vertical Forearm ($110^\circ$), color the forearm segments in neon green (#39FF14).
> 6. Add a sidebar metrics panel showing 'Real-time Elbow Angle' and a 'Privacy Lock' icon to indicate 100% local processing.
> 7. Apply a dark, sporty Tailwind UI."

---

## 6. Business Strategy: Summer 2026 Roadmap
* **Phase 1 (POC):** Functional EVF detection on local hardware.
* **Phase 2 (Beta):** Partnership with 3 Kingston/Toronto-based clubs for "Hybrid Clinics."
* **Phase 3 (B2B):** White-label licensing of the CMP (Continuous Motion Prediction) engine to triathlon training apps.

---
**Proprietary & Confidential** *Developed by Brett Caslick | GlideAI Tech Holdings*