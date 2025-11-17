// pages/api/score-batch.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { insertAudit, insertScore } from "../../server/db";
import { predict as predictScore } from "../../ml/scorer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const body = req.method === "POST" ? req.body : {};
    const stationIds: string[] = body?.stationIds ?? [];
    const council = body?.council as string | undefined;

    if (!stationIds.length && !council) {
      return res.status(400).json({ ok:false, error:"Provide stationIds[] or council" });
    }

    // TODO: if council provided → resolve stationIds for that area.
    // For MVP, we just require stationIds.
    if (!stationIds.length && council) {
      return res.status(400).json({ ok:false, error:"Resolver for council→stationIds not wired yet" });
    }

    const model = process.env.MODEL_VERSION ?? "lgbm-v1";
    const results: Array<{ stationId:string; score:number }> = [];

    for (const id of stationIds) {
      try {
        const out = await predictScore({ stationId: id });
        const score = Math.max(0, Math.min(1, Number(out.score ?? 0.5)));
        await insertScore({ station_id: id, score, model_version: model });
        results.push({ stationId: id, score });
      } catch {
        // continue
      }
    }

    await insertAudit("score_batch", { count: results.length, council, model });

    return res.status(200).json({ ok: true, model, count: results.length, results });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error: e?.message });
  }
}
