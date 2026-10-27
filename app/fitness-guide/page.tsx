"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";

type NutritionResult = {
  name: string;
  brand: string | null;
  servingSize: string;
  caloriesKcal: number | null;
  energyKj: number | null;
  proteinG: number | null;
  carbohydratesG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  source: "photo-estimate" | "barcode-label";
  confidence: "estimated" | "label";
  notes: string;
};

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (!("BarcodeDetector" in window)) return null;
  return (window as Window & { BarcodeDetector: BarcodeDetectorConstructor }).BarcodeDetector;
}

function nutritionValue(value: number | null, unit: string) {
  return value === null ? "—" : `${value} ${unit}`;
}

export default function FitnessGuidePage() {
  const [mode, setMode] = useState<"photo" | "barcode">("photo");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [barcode, setBarcode] = useState("");
  const [result, setResult] = useState<NutritionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoPreviewUrl = useRef("");

  useEffect(() => () => {
    if (photoPreviewUrl.current) URL.revokeObjectURL(photoPreviewUrl.current);
  }, []);

  const lookupBarcode = useCallback(async (code: string) => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const nutrition = await apiRequest<NutritionResult>(
        `/nutrition/barcode/${encodeURIComponent(code.trim())}`
      );
      setResult(nutrition);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not look up this barcode.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!scanning) return;
    let active = true;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let detector: BarcodeDetectorInstance | null = null;
    const videoElement = videoRef.current;

    async function startScanner() {
      const Detector = getBarcodeDetector();
      if (!Detector) {
        setError("Live barcode scanning is not supported in this browser. Enter the barcode below instead.");
        setScanning(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access is not available. Enter the barcode below instead.");
        setScanning(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (!videoElement) return;
        videoElement.srcObject = stream;
        await videoElement.play();
        detector = new Detector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"]
        });

        const scanFrame = async () => {
          if (!active || !detector || !videoElement.videoWidth) return;
          try {
            const codes = await detector.detect(videoElement);
            const code = codes[0]?.rawValue;
            if (code && active) {
              setBarcode(code);
              setScanning(false);
              await lookupBarcode(code);
              return;
            }
          } catch {
            if (active) setError("Could not read that barcode. Try moving closer and holding steady.");
          }
          if (active) timer = window.setTimeout(() => { void scanFrame(); }, 350);
        };
        void scanFrame();
      } catch {
        if (active) {
          setError("Could not start the camera. Allow camera access or enter the barcode below.");
          setScanning(false);
        }
      }
    }

    void startScanner();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [lookupBarcode, scanning]);

  async function analyzePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("photo", photo);
      const nutrition = await apiRequest<NutritionResult>("/nutrition/photo", {
        method: "POST",
        body: formData
      });
      setResult(nutrition);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not estimate this meal.");
    } finally {
      setBusy(false);
    }
  }

  function submitBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{8,14}$/.test(barcode.trim())) {
      setError("Enter a product barcode with 8 to 14 digits.");
      return;
    }
    void lookupBarcode(barcode);
  }

  function chooseMode(nextMode: "photo" | "barcode") {
    setMode(nextMode);
    setError("");
    setResult(null);
    setScanning(false);
  }

  return (
    <main className="fitness-page">
      <header className="fitness-header">
        <Link className="wordmark" href="/" aria-label="Savor home">
          savor<span className="wordmark-dot">.</span>
        </Link>
        <nav aria-label="Fitness guide navigation">
          <Link href="/">Marketplace</Link>
          <span>Food & wellness</span>
        </nav>
        <span className="fitness-header-mark">✳ EAT WELL, FEEL WELL</span>
      </header>

      <section className="fitness-hero">
        <div className="fitness-hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL FOOD GUIDE</div>
          <h1>Know what&apos;s<br />on your <em>plate.</em></h1>
          <p>Scan a meal or packaged food to explore its calories, energy and key nutrients.</p>
          <div className="fitness-hero-note"><span>✳</span> Helpful estimates. Happier, more informed choices.</div>
        </div>
        <div className="fitness-orbit" aria-hidden="true">
          <span className="fitness-orbit-ring" />
          <span className="fitness-orbit-center">NOURISH<br /><b>✳</b><br />YOURSELF</span>
          <span className="fitness-orbit-chip fitness-chip-calories">⚡ Energy</span>
          <span className="fitness-orbit-chip fitness-chip-protein">◌ Protein</span>
          <span className="fitness-orbit-chip fitness-chip-balance">♡ Balance</span>
        </div>
      </section>

      <section className="fitness-workspace" aria-labelledby="scanner-title">
        <div className="fitness-section-heading">
          <div className="eyebrow"><span className="eyebrow-line" /> A LITTLE FOOD CLARITY</div>
          <h2 id="scanner-title">How would you like to scan?</h2>
          <p>Choose a meal photo for an AI estimate, or scan a packaged product&apos;s barcode.</p>
        </div>

        <div className="fitness-mode-tabs" role="tablist" aria-label="Nutrition scan method">
          <button
            type="button"
            id="fitness-photo-tab"
            role="tab"
            aria-controls="fitness-scan-panel"
            aria-selected={mode === "photo"}
            className={mode === "photo" ? "fitness-mode-tab is-selected" : "fitness-mode-tab"}
            onClick={() => chooseMode("photo")}
          >
            <span>◉</span><strong>Scan a meal</strong><small>AI photo estimate</small>
          </button>
          <button
            type="button"
            id="fitness-barcode-tab"
            role="tab"
            aria-controls="fitness-scan-panel"
            aria-selected={mode === "barcode"}
            className={mode === "barcode" ? "fitness-mode-tab is-selected" : "fitness-mode-tab"}
            onClick={() => chooseMode("barcode")}
          >
            <span>▥</span><strong>Packaged food</strong><small>Barcode & label data</small>
          </button>
        </div>

        <div
          id="fitness-scan-panel"
          className="fitness-content-grid"
          role="tabpanel"
          aria-labelledby={mode === "photo" ? "fitness-photo-tab" : "fitness-barcode-tab"}
        >
          <div className="fitness-scan-card">
            {mode === "photo" ? (
              <form className="fitness-scan-form" onSubmit={analyzePhoto}>
                <label className="fitness-photo-drop">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    aria-label="Choose a food photo"
                    onChange={(event) => {
                      const selectedPhoto = event.target.files?.[0] ?? null;
                      if (photoPreviewUrl.current) URL.revokeObjectURL(photoPreviewUrl.current);
                      photoPreviewUrl.current = selectedPhoto ? URL.createObjectURL(selectedPhoto) : "";
                      setPhoto(selectedPhoto);
                      setPhotoPreview(photoPreviewUrl.current);
                      setResult(null);
                      setError("");
                    }}
                  />
                  {photoPreview ? (
                    <Image src={photoPreview} alt="Selected meal to analyze" width={720} height={480} unoptimized />
                  ) : (
                    <>
                      <span className="fitness-photo-icon">↥</span>
                      <strong>Take a photo or choose an image</strong>
                      <span>Show the full serving in good light</span>
                      <small>JPG, PNG or WebP · Up to 5 MB</small>
                    </>
                  )}
                </label>
                <button className="fitness-primary-button" type="submit" disabled={!photo || busy}>
                  {busy ? <><span className="fitness-spinner" /> Estimating your meal...</> : <>Analyze nutrition <span>→</span></>}
                </button>
                <p className="fitness-privacy-note">Your photo is sent to the configured AI provider for analysis. Estimates are approximate and are not medical advice.</p>
              </form>
            ) : (
              <div className="fitness-scan-form">
                {scanning ? (
                  <div className="fitness-camera-wrap">
                    <video ref={videoRef} className="fitness-camera" muted playsInline aria-label="Camera barcode scanner" />
                    <span className="fitness-camera-frame" />
                    <button className="fitness-camera-close" type="button" onClick={() => setScanning(false)}>Stop camera</button>
                    <p>Hold the barcode inside the frame.</p>
                  </div>
                ) : (
                  <div className="fitness-barcode-illustration" aria-hidden="true"><span>▥</span><small>SCAN A BARCODE</small></div>
                )}
                {!scanning && (
                  <button
                    className="fitness-secondary-button"
                    type="button"
                    onClick={() => { setError(""); setScanning(true); }}
                  >
                    <span>⌗</span> Open barcode scanner
                  </button>
                )}
                <div className="fitness-or-divider"><span /> or enter the digits <span /></div>
                <form className="fitness-barcode-form" onSubmit={submitBarcode}>
                  <label htmlFor="nutrition-barcode">Product barcode</label>
                  <div>
                    <input
                      id="nutrition-barcode"
                      inputMode="numeric"
                      pattern="[0-9]{8,14}"
                      maxLength={14}
                      placeholder="e.g. 5000159484695"
                      value={barcode}
                      onChange={(event) => { setBarcode(event.target.value.replace(/\D/g, "")); setError(""); }}
                    />
                    <button type="submit" disabled={busy || barcode.length < 8}>
                      {busy ? "Looking..." : "Look up"}
                    </button>
                  </div>
                  <small>Packaged product information from Open Food Facts.</small>
                </form>
              </div>
            )}
            {error && <p className="fitness-error" role="alert">{error}</p>}
          </div>

          <div className={result ? "fitness-result-card has-result" : "fitness-result-card"} aria-live="polite">
            {result ? (
              <>
                <div className="fitness-result-topline">
                  <span>{result.confidence === "estimated" ? "AI ESTIMATE" : "PRODUCT LABEL"}</span>
                  <span className="fitness-result-check">✳</span>
                </div>
                <h3>{result.name}</h3>
                {result.brand && <p className="fitness-brand">{result.brand}</p>}
                <div className="fitness-serving"><span>Serving</span><strong>{result.servingSize}</strong></div>
                <div className="fitness-calorie-panel">
                  <span>ENERGY</span>
                  <strong>{nutritionValue(result.caloriesKcal, "kcal")}</strong>
                  <small>{nutritionValue(result.energyKj, "kJ")}</small>
                </div>
                <div className="fitness-nutrient-grid">
                  <div><i className="nutrient-protein" /><span>Protein</span><strong>{nutritionValue(result.proteinG, "g")}</strong></div>
                  <div><i className="nutrient-carbs" /><span>Carbs</span><strong>{nutritionValue(result.carbohydratesG, "g")}</strong></div>
                  <div><i className="nutrient-fat" /><span>Total fat</span><strong>{nutritionValue(result.fatG, "g")}</strong></div>
                  <div><i className="nutrient-fiber" /><span>Fiber</span><strong>{nutritionValue(result.fiberG, "g")}</strong></div>
                  <div><i className="nutrient-sugar" /><span>Sugars</span><strong>{nutritionValue(result.sugarG, "g")}</strong></div>
                  <div><i className="nutrient-sodium" /><span>Sodium</span><strong>{nutritionValue(result.sodiumMg, "mg")}</strong></div>
                </div>
                <p className="fitness-result-note">{result.notes}</p>
              </>
            ) : (
              <div className="fitness-result-empty">
                <span className="fitness-result-empty-icon">✳</span>
                <strong>Your nutrition snapshot will appear here</strong>
                <p>Choose a scan method to see calories, energy and key nutrients.</p>
                <div className="fitness-empty-facts"><span>CALORIES</span><i /><span>MACROS</span><i /><span>ENERGY</span></div>
              </div>
            )}
          </div>
        </div>

        <div className="fitness-disclaimer">
          <span>ⓘ</span>
          <p><strong>A friendly guide, not a diagnosis.</strong> Photo results are AI estimates and can vary with ingredients, preparation and portion size. Barcode values depend on the product label and may be incomplete. For medical nutrition advice, talk with a qualified health professional.</p>
        </div>
      </section>
      <footer className="fitness-footer"><Link className="wordmark" href="/">savor<span className="wordmark-dot">.</span></Link><span>Good food, more know-how.</span><Link href="/">Back to the marketplace ↗</Link></footer>
    </main>
  );
}
