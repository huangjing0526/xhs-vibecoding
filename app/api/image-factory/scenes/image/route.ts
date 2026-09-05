import { createAssetHandlers } from "@/app/api/image-factory/_assetRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createAssetHandlers("scenes").IMAGE;
