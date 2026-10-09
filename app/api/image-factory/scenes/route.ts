import { createAssetHandlers } from "@/app/api/image-factory/_assetRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createAssetHandlers("scenes");

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
