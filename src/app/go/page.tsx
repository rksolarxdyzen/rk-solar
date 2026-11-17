import type { Metadata } from "next";
import { AdLandingPage } from "@/components/ads/landing-page";
import { ADS_LANDING } from "@/lib/ads/landing-copy";

export const metadata: Metadata = {
  title: `${ADS_LANDING.brand} — Solar Rooftop Quote`,
  description: ADS_LANDING.sub,
  robots: { index: true, follow: true },
};

export default function GoLandingPage() {
  return <AdLandingPage />;
}
