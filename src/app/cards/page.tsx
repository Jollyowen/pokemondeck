"use client";

import { CardBrowser } from "@/components/cards/CardBrowser";

export default function CardsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Card catalogue</h1>
      <CardBrowser heading="Search" />
    </div>
  );
}
