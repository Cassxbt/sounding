import { redirect } from "next/navigation";

/** The frozen task now lives on the proof page, recomputed there at build. */
export default function Task() {
  redirect("/proof");
}
