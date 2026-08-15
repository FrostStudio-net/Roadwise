import RoadsClient from "@/components/RoadsClient";
import { getRoadMapPayload } from "@/services/road-map";

export const revalidate = 0;

export default async function RoadsPage() {
  const payload = await getRoadMapPayload();
  return <RoadsClient initialData={payload} mapConfigured={Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim())} />;
}
