export type GeoFix = { latitude: number; longitude: number };

export async function captureGeoPosition(timeoutMs = 15000): Promise<GeoFix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Geolocation is not available on this device. Enable GPS and try again.");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(7)),
          longitude: Number(pos.coords.longitude.toFixed(7)),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              "Location permission denied. Enable location for this browser, then tap Retry location."
            )
          );
          return;
        }
        if (err.code === err.TIMEOUT) {
          reject(new Error("Location timed out. Stand outdoors and tap Retry location."));
          return;
        }
        reject(new Error("Could not read GPS. Enter coordinates only if your supervisor allows."));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 }
    );
  });
}
