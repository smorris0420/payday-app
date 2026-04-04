// POST /api/seed — loads Sam's historical paystub data for the calling user.
// Safe to run multiple times (ON CONFLICT DO NOTHING).
// Each stub carries its own rate, so historical accuracy is preserved automatically.
import { neon } from '@neondatabase/serverless';
import { requireAuth } from './_auth.js';

const HISTORICAL_STUBS = [
  {id:'s01',date:'2025-09-25',period:'Sep 14–20',rate:20.9,reg:40,ot:0,hol:0,gross:836,fed:101.17,ss:50.81,med:11.89,den:1.5,medI:15,vis:0,net:null},
  {id:'s02',date:'2025-10-02',period:'Sep 21–27',rate:20.9,reg:40,ot:2,hol:0,gross:898.7,fed:114.97,ss:54.7,med:12.79,den:1.5,medI:15,vis:0,net:null},
  {id:'s03',date:'2025-10-09',period:'Sep 28–Oct 4',rate:21.9,reg:40,ot:0.5,hol:0,gross:892.43,fed:113.59,ss:54.3,med:12.7,den:1.5,medI:15,vis:0,net:null},
  {id:'s04',date:'2025-10-16',period:'Oct 5–11',rate:21.9,reg:40,ot:2.5,hol:0,gross:958.13,fed:128.04,ss:58.38,med:13.65,den:1.5,medI:15,vis:0,net:null},
  {id:'s05',date:'2025-10-23',period:'Oct 12–18',rate:21.9,reg:33.99,ot:8.5,hol:0,gross:1023.61,fed:175.87,ss:71.64,med:16.76,den:1.5,medI:15,vis:0,net:null},
  {id:'s06',date:'2025-10-30',period:'Oct 19–25',rate:21.9,reg:16,ot:32.85,hol:0,gross:840.28,fed:51.06,ss:36.32,med:8.49,den:1.5,medI:15,vis:0,net:null},
  {id:'s07',date:'2025-11-06',period:'Oct 26–Nov 1',rate:21.9,reg:40,ot:0,hol:8,gross:860,fed:109.97,ss:53.29,med:12.46,den:1.5,medI:15,vis:0,net:null},
  {id:'s08',date:'2025-11-13',period:'Nov 2–8',rate:21.9,reg:25,ot:0,hol:0,gross:876,fed:109.97,ss:53.29,med:12.47,den:1.5,medI:15,vis:0,net:null},
  {id:'s09',date:'2025-11-20',period:'Nov 9–15',rate:21.9,reg:40,ot:32.85,hol:0,gross:2111.28,fed:296.68,ss:102.85,med:24.05,den:1.5,medI:15,vis:0,net:null},
  {id:'s10',date:'2025-11-26',period:'Nov 16–22',rate:21.9,reg:40,ot:4.75,hol:0,gross:1032.04,fed:144.3,ss:62.96,med:14.73,den:1.5,medI:15,vis:0,net:null},
  {id:'s11',date:'2025-12-04',period:'Nov 23–29',rate:21.9,reg:40,ot:0.75,hol:1,gross:922.54,fed:153.94,ss:65.68,med:15.36,den:1.5,medI:15,vis:0,net:null},
  {id:'s12',date:'2025-12-11',period:'Nov 30–Dec 6',rate:21.9,reg:40,ot:1.75,hol:0,gross:933.49,fed:122.62,ss:56.85,med:13.29,den:1.5,medI:15,vis:0,net:null},
  {id:'s13',date:'2025-12-18',period:'Dec 7–13',rate:21.9,reg:40,ot:1,hol:0,gross:908.86,fed:117.2,ss:55.33,med:12.94,den:1.5,medI:15,vis:0,net:null},
  {id:'s14',date:'2025-12-24',period:'Dec 14–20',rate:21.9,reg:40,ot:0,hol:0,gross:876,fed:109.97,ss:53.29,med:12.46,den:1.5,medI:15,vis:0,net:null},
  {id:'s15',date:'2025-12-31',period:'Dec 21–27',rate:21.9,reg:40,ot:0,hol:1,gross:897.9,fed:152.15,ss:65.17,med:15.25,den:69,medI:690,vis:0,net:818.63},
  {id:'s16',date:'2026-01-08',period:'Dec 28–Jan 3',rate:21.9,reg:40,ot:0.25,hol:1,gross:906.11,fed:148.14,ss:64.47,med:15.08,den:2,medI:17,vis:0.5,net:null},
  {id:'s17',date:'2026-01-15',period:'Jan 4–10',rate:21.9,reg:40,ot:0,hol:0,gross:876,fed:107.79,ss:53.11,med:12.42,den:2,medI:17,vis:0.5,net:null},
  {id:'s18',date:'2026-01-22',period:'Jan 11–17',rate:21.9,reg:40,ot:0,hol:0,gross:876,fed:115.02,ss:55.14,med:12.89,den:2,medI:17,vis:0.5,net:null},
  {id:'s19',date:'2026-01-29',period:'Jan 18–24',rate:21.9,reg:40,ot:0,hol:1,gross:897.9,fed:146.34,ss:63.96,med:14.96,den:2,medI:17,vis:0.5,net:null},
  {id:'s20',date:'2026-02-05',period:'Jan 25–31',rate:21.9,reg:40,ot:0,hol:0,gross:876,fed:112.56,ss:55.65,med:13.02,den:2,medI:17,vis:0.5,net:null},
  {id:'s21',date:'2026-02-12',period:'Feb 1–7',rate:21.9,reg:12,ot:0,hol:0,gross:262.8,fed:8.85,ss:15.09,med:3.53,den:2,medI:17,vis:0.5,net:null},
  {id:'s22',date:'2026-02-19',period:'Feb 8–14',rate:21.9,reg:40,ot:0,hol:0,gross:876,fed:103.53,ss:53.11,med:12.42,den:2,medI:17,vis:0.5,net:null},
  {id:'s23',date:'2026-02-26',period:'Feb 15–21',rate:21.9,reg:24,ot:0,hol:0,gross:525.6,fed:103.53,ss:53.1,med:12.42,den:2,medI:17,vis:0.5,net:687.45},
  {id:'s24',date:'2026-03-05',period:'Feb 22–28',rate:21.9,reg:16,ot:0,hol:0,gross:350.4,fed:103.53,ss:53.1,med:12.41,den:2,medI:17,vis:0.5,net:null},
  {id:'s25',date:'2026-03-12',period:'Mar 1–7',rate:21.9,reg:40,ot:0,hol:0,gross:876,fed:103.53,ss:53.11,med:12.42,den:2,medI:17,vis:0.5,net:687.44},
  {id:'s26',date:'2026-03-19',period:'Mar 8–14',rate:21.9,reg:40,ot:0,hol:0,gross:876,fed:103.53,ss:53.1,med:12.42,den:2,medI:17,vis:0.5,net:687.45},
  {id:'s27',date:'2026-03-26',period:'Mar 15–21',rate:21.9,reg:40,ot:1,hol:0,gross:908.85,fed:110.75,ss:55.14,med:12.9,den:2,medI:17,vis:0.5,net:null},
  {id:'s28',date:'2026-04-02',period:'Mar 22–28',rate:21.9,reg:24,ot:0,hol:0,gross:525.6,fed:39.77,ss:31.38,med:7.34,den:2,medI:17,vis:0.5,net:427.61},
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = await requireAuth(req, res);
  if (!payload) return;

  const sql = neon(process.env.DATABASE_URL);
  const userId = payload.userId;

  try {
    for (const s of HISTORICAL_STUBS) {
      await sql`
        INSERT INTO stubs (id,user_id,date,period,rate,reg,ot,hol,gross,fed,ss,med,den,med_i,vis,net,seeded)
        VALUES (${s.id},${userId},${s.date},${s.period},${s.rate},${s.reg},
                ${s.ot||0},${s.hol||0},${s.gross},${s.fed},${s.ss},${s.med},
                ${s.den},${s.medI},${s.vis},${s.net||null},true)
        ON CONFLICT (id, user_id) DO NOTHING
      `;
    }
    // Seed defaultRate setting so calculator opens at 21.90
    await sql`
      INSERT INTO settings (user_id, key, value)
      VALUES (${userId}, 'defaultRate', '21.9')
      ON CONFLICT (user_id, key) DO NOTHING
    `;
    return res.status(200).json({ ok: true, stubs: HISTORICAL_STUBS.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
