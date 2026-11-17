import { Suspense } from "react";
import AdsLoginPage from "./page.client";

export default function AdsLoginRoute() {
  return (
    <Suspense fallback={null}>
      <AdsLoginPage />
    </Suspense>
  );
}
