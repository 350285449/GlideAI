export function cameraUnsupportedMessage(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Camera access needs a secure page. Open the app at http://localhost:3000 or http://127.0.0.1:3000, or use HTTPS if it is deployed or opened from another device.";
  }
  return "This browser does not expose camera access. Open the app in desktop Chrome or Microsoft Edge at http://localhost:3000 or http://127.0.0.1:3000, not inside an embedded preview.";
}

export function cameraErrorMessage(error: unknown): string {
  const fallback = "Camera is unavailable.";
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : String(error || fallback);
  const normalized = `${name} ${message}`.toLowerCase();

  if (
    normalized.includes("getusermedia") ||
    normalized.includes("not implemented") ||
    normalized.includes("media devices")
  ) {
    return cameraUnsupportedMessage();
  }
  if (name === "NotAllowedError" || normalized.includes("permission")) {
    return "Camera permission was blocked. Allow camera access in the browser address bar, then press Retry camera.";
  }
  if (name === "NotFoundError" || normalized.includes("requested device not found")) {
    return "No camera was found. Plug in or enable a webcam, then press Retry camera.";
  }
  if (name === "NotReadableError" || normalized.includes("could not start")) {
    return "The camera is already in use or Windows blocked it. Close other camera apps and check Windows Privacy > Camera.";
  }
  return message || fallback;
}

export function hasBrowserCameraApi(): boolean {
  return Boolean(typeof navigator !== "undefined" && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
}

export function appAssetUrl(path: string): string {
  if (typeof document === "undefined") return path;
  return new URL(path, document.baseURI).toString();
}