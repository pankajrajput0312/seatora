import type { Metadata } from "next";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { ChoicesView } from "@/features/decide/components/choices-view";

export const metadata: Metadata = { title: "Choices" };

export default function ChoicesPage() {
  return (
    <AppPage className="py-6">
      <PageHead title="Choices">
        Your choice list in the order you&apos;ll enter it on the MCC portal. Saved on this device. Drag, use the keyboard (Space to pick up, arrows to move), or the move buttons.
      </PageHead>
      <ChoicesView />
    </AppPage>
  );
}
