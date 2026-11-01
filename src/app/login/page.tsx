import { Suspense } from "react";
import LoginPage from "./page.client";

export default function LoginRoute() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
