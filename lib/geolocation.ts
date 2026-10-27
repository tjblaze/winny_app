export type Coordinates = {
  latitude: number;
  longitude: number;
};

export function getCurrentCoordinates(): Promise<Coordinates> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Location access is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Allow location access in your browser to find nearby kitchens."));
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error("Your current location could not be determined."));
        } else {
          reject(new Error("Location lookup timed out. Please try again."));
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  });
}
