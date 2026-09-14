/**
 * Diamond Shield Dictionary — Unified Content Filter Database
 *
 * Single source of truth for all content filtering across Diamond Browser's
 * 5-layer protection system. Imported by safetyFilter.ts (Layer 3) and
 * webviewPreload.ts (Layer 4 + Layer 5).
 *
 * ENCODING: All filter dictionaries are stored as a base64-encoded JSON blob.
 * This keeps the source code clean and presentation-safe while maintaining
 * full functionality at runtime. 756+ terms across 22 categories covering:
 * Adult, Gambling, Piracy, Drugs, Violence, Self-Harm, Crime, Hate Speech.
 *
 * To update the dictionary, modify the generator script and re-encode.
 */

// ─── Decode Utility (Node.js main process + browser renderer) ───

function _decode(encoded: string): Record<string, any> {
  try {
    const json = typeof Buffer !== 'undefined'
      ? Buffer.from(encoded, 'base64').toString('utf-8')
      : atob(encoded);
    return JSON.parse(json);
  } catch {
    console.error('[Diamond Shield] Failed to decode filter dictionary');
    return {};
  }
}

// ─── Encoded Filter Database ────────────────────────────────────
// All content filter data is encoded below for source code cleanliness.
// Do NOT edit this string directly — use the generator script instead.

const _RAW = _decode(
  "eyJhZHVsdERvbWFpbnMiOlsieGhhbXN0ZXIiLCJwb3JuaHViIiwieHZpZGVvcyIsInhueHgiLCJyZWR0dWJlIiwieW91cG9ybiIsImJyYXp6ZXJzIiwiY2hh" +
  "dHVyYmF0ZSIsIm9ubHlmYW5zIiwic3RyaXBjaGF0IiwiYmVlZyIsInNwYW5rYmFuZyIsInR1YmVnYWxvcmUiLCJsaXZlamFzbWluIiwiY2FtNCIsImNhbXNv" +
  "ZGEiLCJib25nYWNhbXMiLCJmYXBob3VzZSIsImVwb3JuZXIiLCJ0bmFmbGl4IiwibW90aGVybGVzcyIsIm5vb2RsZW1hZ2F6aW5lIiwiZGFmdHNleCIsImhl" +
  "YXZ5LXIiLCJoZW50YWkiLCJydWxlMzQiLCJuaGVudGFpIiwiZS1oZW50YWkiLCJlcm9tZSIsImZhcGVsbG8iLCJ0aG90aHViIiwiY29vbWVyIiwia2Vtb25v" +
  "IiwibHVzY2lvdXMiLCJiYWRqb2pvIiwiZnVxIiwiaHFwb3JuZXIiLCJ0eHh4IiwidXBvcm5pYSIsInZqYXYiLCJqYXZoZCIsImphdmJ1cyIsIm1pc3NhdiIs" +
  "ImphYmxlIiwicG9ybmRpZyIsInNsdXRsb2FkIiwiZW1wZmxpeCIsInBsYXlib3kiLCJwZW50aG91c2UiLCJodXN0bGVyIiwicmVkd2FwIiwiaW5kaWFucG9y" +
  "biIsImRlc2lwb3JuIiwicG9ybjU1NSIsInR1YmU4IiwiYmFuZ2Jyb3MiLCJyZWFsaXR5a2luZ3MiLCJuYXVnaHR5YW1lcmljYSIsInR3aXN0eXMiLCJkcnR1" +
  "YmVyIiwibnV2aWQiLCJwb3JudHViZSIsInN1bnBvcm5vIiwiemJwb3JuIiwicG9ybnJhYmJpdCIsImFueXBvcm4iLCI0dHViZSIsInBvcm5kb2UiLCJ4dGFw" +
  "ZXMiLCJwb3JuaGF0IiwicG9ybmt0dWJlIiwicGFsaW1hcyIsInNleHZpZCIsInBvcm4wMCIsImZ1bGxwb3JuZXIiLCJmcmVlYWR1bHQiLCJ4eHhraW5nIiwi" +
  "aGFyZGNvcmVzZXgiLCJlcm90aWNtdiIsInBvcm5vbmUiLCJqYXZjbCIsImphdnN1YiIsInN1cGphdiIsImF2Z2xlIiwiamF2ZG9lIiwiamF2ZnJlZSIsIjdt" +
  "bXR2IiwidGh1bWJ6aWxsYSIsInJlZGdpZnMiLCJteWZyZWVjYW1zIiwiZmxpcnQ0ZnJlZSIsImltbGl2ZSIsInN0cmVhbWF0ZSIsImNhbXdob3JlcyIsImFk" +
  "dWx0ZnJpZW5kZmluZGVyIiwiYXNobGV5bWFkaXNvbiIsImZldGxpZmUiLCJlcm90aWNpdHkiLCJwb3JubyIsInh4eCIsInRlcmsiXSwiYWR1bHRUbGRzIjpb" +
  "Ii54eHgiLCIucG9ybiIsIi5hZHVsdCIsIi5zZXgiLCIuY2FtIl0sImdhbWJsaW5nRG9tYWlucyI6WyJiZXQzNjUiLCIxeGJldCIsInBhcmltYXRjaCIsImJl" +
  "dHdheSIsImJvdmFkYSIsImRyYWZ0a2luZ3MiLCJmYW5kdWVsIiwiYmV0ZmFpciIsIjg4OGNhc2lubyIsInBva2Vyc3RhcnMiLCJyb29iZXQiLCJyb2xsYml0" +
  "Iiwic3Rha2UuY29tIiwiY2FzdW1vIiwibGVvdmVnYXMiLCJiZXRzc29uIiwidW5pYmV0IiwiYndpbiIsIndpbGxpYW1oaWxsIiwicGFkZHlwb3dlciIsImxh" +
  "ZGJyb2tlcyIsImNvcmFsIiwic3BvcnRpbmdiZXQiLCJwaW5uYWNsZSIsIjIyYmV0IiwibWVsYmV0IiwiYmV0dmljdG9yIiwiYmV0ZnJlZCIsInNreWJldCIs" +
  "ImJldGFubyIsImphY2twb3RjaXR5Iiwic3BpbnBhbGFjZSIsInJveWFsdmVnYXMiLCJiZXRtZ20iLCJjYWVzYXJzcGFsYWNlIiwiaGFycmFoc2Nhc2lubyIs" +
  "InRyb3BpY2FuYSIsImJvcmdhdGEiLCJnb2xkZW5iZXQiLCJyYWpiZXQiLCJkYWZhYmV0IiwiZnVuODgiLCJ3ODgiLCJiZXRjbGljIiwiYmV0Y3JpcyIsImJl" +
  "dHNhZmUiLCJiZXRvbmxpbmUiLCJteWJvb2tpZSIsInNwb3J0c2JldHRpbmciLCJ4YmV0IiwibWVnYXBhcmkiLCJtb3N0YmV0IiwibGluZWJldCJdLCJwaXJh" +
  "Y3lEb21haW5zIjpbInRoZXBpcmF0ZWJheSIsIjEzMzd4IiwieXRzLm14IiwicmFyYmciLCJ0b3JyZW50eiIsImZpdGdpcmwtcmVwYWNrcyIsImtpY2thc3Mi" +
  "LCJsaW1ldG9ycmVudHMiLCJ0b3JyZW50Z2FsYXh5IiwibnlhYSIsInJ1dHJhY2tlciIsInBpcmF0ZWlybyIsInRvcmxvY2siLCJldHR2Iiwiem9vcWxlIiwi" +
  "bWFnbmV0ZGwiLCJnbG9kbHMiLCJ0b3JyZW50ZG93bmxvYWQiLCJzZWVkciIsInpiaWd6IiwicHJlbWl1bWl6ZSJdLCJzb2NpYWxNZWRpYURvbWFpbnMiOlsi" +
  "dGlrdG9rLmNvbSIsImluc3RhZ3JhbS5jb20iLCJzbmFwY2hhdC5jb20iLCJ0d2l0dGVyLmNvbSIsInguY29tIiwiZmFjZWJvb2suY29tIiwidGhyZWFkcy5u" +
  "ZXQiLCJtYXN0b2Rvbi5zb2NpYWwiLCJ0dW1ibHIuY29tIiwicmVkZGl0LmNvbSIsInBpbnRlcmVzdC5jb20iLCJsaW5rZWRpbi5jb20iLCJ3aGF0c2FwcC5j" +
  "b20iLCJ3ZWIud2hhdHNhcHAuY29tIiwidGVsZWdyYW0ub3JnIiwid2ViLnRlbGVncmFtLm9yZyIsInNpZ25hbC5vcmciLCJkaXNjb3JkLmNvbSIsImRpc2Nv" +
  "cmQuZ2ciXSwiZ2FtaW5nRG9tYWlucyI6WyJzdG9yZS5zdGVhbXBvd2VyZWQuY29tIiwic3RlYW1wb3dlcmVkLmNvbSIsImVwaWNnYW1lcy5jb20iLCJvcmln" +
  "aW4uY29tIiwiZWEuY29tIiwidWJpc29mdC5jb20iLCJ0d2l0Y2gudHYiLCJyb2Jsb3guY29tIiwibWluaWNsaXAuY29tIiwia29uZ3JlZ2F0ZS5jb20iLCJu" +
  "ZXdncm91bmRzLmNvbSIsIml0Y2guaW8iLCJnb2cuY29tIiwiaHVtYmxlYnVuZGxlLmNvbSIsImJhdHRsZW5ldC5jb20iLCJibGl6emFyZC5jb20iXSwidnBu" +
  "UHJveHlEb21haW5zIjpbIm5vcmR2cG4uY29tIiwiZXhwcmVzc3Zwbi5jb20iLCJzdXJmc2hhcmsuY29tIiwicHJvdG9udnBuLmNvbSIsIndpbmRzY3JpYmUu" +
  "Y29tIiwidHVubmVsYmVhci5jb20iLCJjeWJlcmdob3N0dnBuLmNvbSIsImlwdmFuaXNoLmNvbSIsInByaXZhdGVpbnRlcm5ldGFjY2Vzcy5jb20iLCJtdWxs" +
  "dmFkLm5ldCIsImhpZGUubWUiLCJob3RzcG90c2hpZWxkLmNvbSIsImhpZGVteWFzcy5jb20iLCJwdXJldnBuLmNvbSIsInN0cm9uZ3Zwbi5jb20iLCJ0b3Jw" +
  "cm9qZWN0Lm9yZyIsInRvci5jb20iLCJrcHJveHkuY29tIiwicHJveHlzaXRlLmNvbSIsInVuYmxvY2t2aWRlb3MuY29tIiwiY3JveHlwcm94eS5jb20iLCJo" +
  "aWRlaXAubWUiLCJhbm9ueW1vdXNlLm9yZyIsImZpbHRlcmJ5cGFzcy5tZSIsInVuYmxvY2tzaXRlcy5jbyIsIndlYnByb3h5LnRvIiwidnBuZ2F0ZS5uZXQi" +
  "XSwidXJsU2hvcnRlbmVyRG9tYWlucyI6WyJiaXQubHkiLCJ0aW55dXJsLmNvbSIsInQuY28iLCJnb28uZ2wiLCJvdy5seSIsImlzLmdkIiwiYnVmZi5seSIs" +
  "ImFkZi5seSIsImJsLmluayIsInNvby5nZCIsInJlYnJhbmQubHkiLCJzLmlkIiwidi5nZCIsImNsY2sucnUiLCJzaG9ydHVybC5hdCIsImN1dHQubHkiLCJy" +
  "Yi5neSIsInNob3J0LmlvIiwidGlueS5jYyIsImxua2QuaW4iXSwiYWR1bHRUb2tlbnMiOlsicG9ybiIsInBvcm5vIiwieHh4Iiwic2V4IiwiaGVudGFpIiwi" +
  "ZXJvdGljIiwiZXJvdGljYSIsIm51ZGUiLCJudWRlcyIsIm5ha2VkIiwibnNmdyIsImJvb2JzIiwiZGlsZG8iLCJ2YWdpbmEiLCJwZW5pcyIsImZldGlzaCIs" +
  "ImJsb3dqb2IiLCJjcmVhbXBpZSIsImN1bXNob3QiLCJvcmdhc20iLCJob3JueSIsIm1pbGYiLCJpbmNlc3QiLCJmYXAiLCJlc2NvcnQiLCJzdHJpcHBlciIs" +
  "ImNhbWdpcmwiLCJkZWVwdGhyb2F0IiwidGhyZWVzb21lIiwiZ2FuZ2JhbmciLCJoYXJkY29yZSJdLCJnYW1ibGluZ1Rva2VucyI6WyJjYXNpbm8iLCJnYW1i" +
  "bGluZyIsInBva2VyIiwicm91bGV0dGUiLCJibGFja2phY2siLCJzbG90cyIsImJvb2ttYWtlciIsInNwb3J0c2JldCIsImJvb2tpZSJdLCJleHBsaWNpdEtl" +
  "eXdvcmRzIjpbInBvcm4iLCJwb3JubyIsInBvcm5vZ3JhcGh5IiwieHh4IiwibnNmdyIsImhlbnRhaSIsImVyb3RpYyIsImVyb3RpY2EiLCJudWRlIiwibnVk" +
  "ZXMiLCJuYWtlZCIsIm51ZGl0eSIsImNhbWdpcmwiLCJjYW0gZ2lybCIsIndlYmNhbSBzZXgiLCJsaXZlIHNleCIsImVzY29ydCBzZXJ2aWNlIiwiZXNjb3J0" +
  "cyIsImNhbGwgZ2lybHMiLCJzdHJpcCBjbHViIiwic3RyaXBwZXIiLCJzdHJpcHRlYXNlIiwib25seWZhbnMiLCJmYW5zbHkiLCJtYW55dmlkcyIsInh2aWRl" +
  "b3MiLCJwb3JuaHViIiwicmVkdHViZSIsInhoYW1zdGVyIiwiYnJhenplcnMiLCJibG93am9iIiwiaGFuZGpvYiIsImRlZXB0aHJvYXQiLCJnYW5nYmFuZyIs" +
  "InRocmVlc29tZSIsImN1bXNob3QiLCJjcmVhbXBpZSIsIm9yZ2FzbSIsIm1hc3R1cmJhdCIsImRpbGRvIiwidmlicmF0b3IiLCJzZXggdG95Iiwic2V4IHRv" +
  "eXMiLCJtaWxmIiwiZ2lsZiIsImluY2VzdCIsInN0ZXBtb20iLCJzdGVwc2lzIiwiYnV5IHdlZWQiLCJidXkgY29jYWluZSIsImJ1eSBoZXJvaW4iLCJidXkg" +
  "bWV0aCIsImRydWcgZGVhbGVyIiwiZHJ1ZyBkZWFsaW5nIiwiZHJ1ZyB0cmFmZmlja2luZyIsImhvdyB0byBtYWtlIG1ldGgiLCJob3cgdG8gY29vayBtZXRo" +
  "IiwiaG93IHRvIGdyb3cgd2VlZCIsImRhcmsgd2ViIGRydWdzIiwiZGFya25ldCBtYXJrZXQiLCJjcmFjayBwaXBlIiwibWV0aCBwaXBlIiwiYm9uZyBzaG9w" +
  "IiwiZ29yZSB2aWRlbyIsImRlYXRoIHZpZGVvIiwibXVyZGVyIHZpZGVvIiwiYmVoZWFkaW5nIHZpZGVvIiwiZXhlY3V0aW9uIHZpZGVvIiwiaG93IHRvIGtp" +
  "bGwgc29tZW9uZSIsImhvdyB0byBtdXJkZXIiLCJzbnVmZiBmaWxtIiwicmVhbCBkZWF0aCIsInNjaG9vbCBzaG9vdGluZyIsIm1hc3Mgc2hvb3RpbmcgcGxh" +
  "biIsImhvdyB0byBjdXQgeW91cnNlbGYiLCJjdXR0aW5nIG1ldGhvZHMiLCJob3cgdG8gZW5kIGl0IGFsbCIsInN1aWNpZGUgbWV0aG9kcyIsIndheXMgdG8g" +
  "ZGllIiwicGFpbmxlc3MgZGVhdGgiLCJwcm8gYW5hIiwicHJvIG1pYSIsInRoaW5zcG8iLCJ0aGluc3BpcmF0aW9uIiwiaG93IHRvIG1ha2UgYSBib21iIiwi" +
  "Ym9tYiBtYWtpbmciLCJob3cgdG8gbWFrZSBleHBsb3NpdmVzIiwicGlwZSBib21iIiwiYnV5IGlsbGVnYWwgZ3VucyIsImdob3N0IGd1biIsImJ1eSBzd2l0" +
  "Y2hibGFkZSIsImJ1eSBicmFzcyBrbnVja2xlcyIsImhvdyB0byBoYWNrIHNvbWVvbmUiLCJob3cgdG8gc3RlYWwiLCJob3cgdG8gc2hvcGxpZnQiLCJzaG9w" +
  "bGlmdGluZyB0aXBzIiwiaG93IHRvIHBpY2sgYSBsb2NrIiwibG9ja3BpY2tpbmcgZm9yIHRoZWZ0IiwiaG93IHRvIGhvdHdpcmUgYSBjYXIiLCJjYXIgdGhl" +
  "ZnQgZ3VpZGUiLCJpZGVudGl0eSB0aGVmdCBndWlkZSIsImNyZWRpdCBjYXJkIGZyYXVkIiwiaG93IHRvIHNjYW0iLCJzY2FtbWluZyB0dXRvcmlhbCIsIndo" +
  "aXRlIHN1cHJlbWFjeSIsIm5lbyBuYXppIiwid2hpdGUgcG93ZXIiLCJyYWNpYWwgY2xlYW5zaW5nIiwiZXRobmljIGNsZWFuc2luZyIsImpvaW4gaXNpcyIs" +
  "ImlzaXMgcmVjcnVpdG1lbnQiLCJhbCBxYWVkYSIsInRlcnJvcmlzdCBhdHRhY2sgcGxhbiIsImppaGFkIHJlY3J1aXRtZW50Il0sInN1Z2dlc3RpdmVQaHJh" +
  "c2VzIjpbImhvdCBnaXJsIiwiaG90IGdpcmxzIiwiaG90IGJhYmUiLCJob3QgYmFiZXMiLCJzZXh5IGdpcmwiLCJzZXh5IGdpcmxzIiwic2V4eSBiYWJlIiwi" +
  "c2V4eSBiYWJlcyIsInNleHkgcGhvdG8iLCJzZXh5IHBob3RvcyIsInNleHkgcGljIiwic2V4eSBwaWNzIiwic2V4eSB2aWRlbyIsInNleHkgdmlkZW9zIiwi" +
  "c2V4eSBkYW5jZSIsImhvdCBwaG90byIsImhvdCBwaG90b3MiLCJob3QgcGljIiwiaG90IHBpY3MiLCJob3QgdmlkZW8iLCJob3QgdmlkZW9zIiwiaG90IGRh" +
  "bmNlIiwiYmlraW5pIHBob3RvIiwiYmlraW5pIHZpZGVvIiwiYmlraW5pIHBpY3MiLCJib290eSBzaGFrZSIsImJvb3R5IHNoYWtpbmciLCJib290eSBkYW5j" +
  "ZSIsInR3ZXJrIiwidHdlcmtpbmciLCJib2R5IHNob3ciLCJib2R5IHJldmVhbCIsIndhcmRyb2JlIG1hbGZ1bmN0aW9uIiwibmlwIHNsaXAiLCJuaXBzbGlw" +
  "IiwidXBza2lydCIsImRvd25ibG91c2UiLCJjbGVhdmFnZSBzaG93IiwiZGVlcCBjbGVhdmFnZSIsInNlZSB0aHJvdWdoIiwic2VlLXRocm91Z2giLCJubyBi" +
  "cmEiLCJicmFsZXNzIiwibm8gcGFudGllcyIsImxpbmdlcmllIHRyeSIsImxpbmdlcmllIGhhdWwiLCJ1bmRlcndlYXIgaGF1bCIsImJpa2luaSB0cnkgb24i" +
  "LCJiaWtpbmkgaGF1bCIsInN3aW1zdWl0IGhhdWwiLCJvbmx5IGZhbnMiLCJvbmx5ZmFucyBsaW5rIiwic3VnYXIgZGFkZHkiLCJzdWdhciBiYWJ5IiwiaG9v" +
  "a3VwIiwiaG9vayB1cCIsIm9uZSBuaWdodCBzdGFuZCIsImZyaWVuZHMgd2l0aCBiZW5lZml0cyIsImFkdWx0IGNvbnRlbnQiLCJhZHVsdHMgb25seSIsIjE4" +
  "KyIsIjE4ICsiLCJub3QgZm9yIGtpZHMiLCJ2aWV3ZXIgZGlzY3JldGlvbiIsImJpZyBib29icyIsImJpZyBhc3MiLCJiaWcgYnV0dCIsInRoaWNrIHRoaWdo" +
  "cyIsImN1cnZ5IGJvZHkiLCJob3QgYm9keSIsInBlcmZlY3QgYm9keSIsImxhcCBkYW5jZSIsInBvbGUgZGFuY2UiLCJzdHJpcCBkYW5jZSIsInN0cmlwIHRl" +
  "YXNlIiwid2V0IHQtc2hpcnQiLCJ3ZXQgdHNoaXJ0Iiwic21va2Ugd2VlZCIsInNtb2tpbmcgd2VlZCIsImdldHRpbmcgaGlnaCIsInJvbGxpbmcgam9pbnRz" +
  "IiwiaG93IHRvIHJvbGwiLCJ2YXBlIHRyaWNrcyIsImRydW5rIGNoYWxsZW5nZSIsImRyaW5raW5nIGdhbWUiLCJiZWVyIHBvbmciLCJhbGNvaG9sIGNoYWxs" +
  "ZW5nZSIsInNob3RzIGNoYWxsZW5nZSIsImVhc3kgbW9uZXkgb25saW5lIiwiZ2V0IHJpY2ggcXVpY2siLCJvbmxpbmUgYmV0dGluZyB0aXBzIiwic3VyZSB3" +
  "aW4gYmV0IiwiamFja3BvdCBoYWNrIiwic2xvdCBtYWNoaW5lIHRyaWNrIiwiY2FzaW5vIHN0cmF0ZWd5IiwicG9rZXIgY2hlYXQiLCJjc2dvIGdhbWJsaW5n" +
  "Iiwic2tpbiBnYW1ibGluZyIsImNyeXB0byBjYXNpbm8iLCJjcmFzaCBnYW1ibGluZyIsInN0cmVldCBmaWdodCIsImJydXRhbCBmaWdodCIsImtub2Nrb3V0" +
  "IGNvbXBpbGF0aW9uIiwiZ2FuZyBmaWdodCIsInByaXNvbiBmaWdodCIsImFuaW1hbCBjcnVlbHR5IiwiYW5pbWFsIGFidXNlIiwicm9hZCByYWdlIGZpZ2h0" +
  "IiwidmlvbGVudCBwcmFuayIsInNjaG9vbCBmaWdodCIsImJ1bGx5IGJlYXRkb3duIiwiZGVwcmVzc2lvbiBhZXN0aGV0aWMiLCJzYWQgYWVzdGhldGljIiwi" +
  "d2FudCB0byBkaWUiXSwieW91dHViZVRpdGxlUGF0dGVybnMiOlsib2ZmaWNpYWwgMTgrIiwiKDE4KykiLCJbMTgrXSIsIjE4KyBvbmx5IiwidW5jZW5zb3Jl" +
  "ZCB2ZXJzaW9uIiwidW5jZW5zb3JlZCB2aWRlbyIsInVuY3V0IHZlcnNpb24iLCJleHBsaWNpdCB2ZXJzaW9uIiwiZXhwbGljaXQgdmlkZW8iLCJiYW5uZWQg" +
  "bXVzaWMgdmlkZW8iLCJiYW5uZWQgdmlkZW8iLCJ0b28gaG90IGZvciB0diIsInRvbyBzZXh5IiwiYWdlIHJlc3RyaWN0ZWQiLCJhZ2UtcmVzdHJpY3RlZCIs" +
  "InRyeSBub3QgdG8gbG9vayBhd2F5IiwidHJ5IG5vdCB0byBnZXQiLCJob3R0ZXN0IG1vbWVudHMiLCJzZXhpZXN0IG1vbWVudHMiLCJob3R0ZXN0IHNjZW5l" +
  "cyIsInNleGllc3Qgc2NlbmVzIiwibW9zdCBzZWR1Y3RpdmUiLCJzZWR1Y3RpdmUgZGFuY2UiLCJjb21waWxhdGlvbiBob3QiLCJjb21waWxhdGlvbiBzZXh5" +
  "IiwiZHJ1ZyB0cmlwIiwiYWNpZCB0cmlwIiwic2hyb29tIHRyaXAiLCJnZXR0aW5nIHdhc3RlZCIsImJsYWNrb3V0IGRydW5rIiwic21va2luZyBjaGFsbGVu" +
  "Z2UiLCJ2YXBpbmcgY2hhbGxlbmdlIiwiY2F1Z2h0IG9uIGNhbWVyYSBmaWdodCIsInJlYWwgZmlnaHQiLCJzdHJlZXQgZmlnaHQgY29tcGlsYXRpb24iLCJr" +
  "bm9ja291dCBjb21waWxhdGlvbiIsIm1vc3QgYnJ1dGFsIiwibW9zdCB2aW9sZW50IiwiZGlzdHVyYmluZyBmb290YWdlIiwiZ3JhcGhpYyBjb250ZW50IHdh" +
  "cm5pbmciLCJ2aWV3ZXIgZGlzY3JldGlvbiBhZHZpc2VkIiwibm90IGZvciBzZW5zaXRpdmUgdmlld2VycyJdLCJoaWdoQ29uZmlkZW5jZVRva2VucyI6WyJw" +
  "b3JuIiwicG9ybm8iLCJ4eHgiLCJoZW50YWkiLCJuc2Z3IiwiY2FtZ2lybCJdLCJkcnVnS2V5d29yZHMiOlsibWFyaWp1YW5hIiwiY2FubmFiaXMiLCJ3ZWVk" +
  "IiwiY29jYWluZSIsImhlcm9pbiIsIm1ldGhhbXBoZXRhbWluZSIsIm1ldGgiLCJlY3N0YXN5IiwibWRtYSIsIm1vbGx5IiwibHNkIiwiYWNpZCB0cmlwIiwi" +
  "c2hyb29tcyIsIm11c2hyb29tcyB0cmlwIiwiZmVudGFueWwiLCJvcGlvaWQiLCJveHljb250aW4iLCJ4YW5heCBhYnVzZSIsImtldGFtaW5lIiwicGNwIiwi" +
  "ZG10IiwiYXlhaHVhc2NhIiwiY3JhY2sgY29jYWluZSIsImNyeXN0YWwgbWV0aCIsImRydWcgdXNlIiwiZHJ1ZyBhYnVzZSIsInN1YnN0YW5jZSBhYnVzZSIs" +
  "Im92ZXJkb3NlIiwic2hvb3RpbmcgdXAiLCJpbmplY3RpbmcgZHJ1Z3MiLCJzbm9ydGluZyIsImh1ZmZpbmciLCJpbmhhbGFudCBhYnVzZSIsImRydWcgcGFy" +
  "YXBoZXJuYWxpYSIsInJvbGxpbmcgcGFwZXIiLCJlZGlibGVzIiwidGhjIGd1bW15Iiwid2VlZCBicm93bmllcyIsInZhcGUganVpY2UiLCJuaWNvdGluZSBh" +
  "ZGRpY3Rpb24iLCJob29rYWggbG91bmdlIiwic2hpc2hhIl0sInZpb2xlbmNlS2V5d29yZHMiOlsiZ29yZSIsImdvcnkiLCJncmFwaGljIHZpb2xlbmNlIiwi" +
  "ZXh0cmVtZSB2aW9sZW5jZSIsImJsb29kIGFuZCBnb3JlIiwibXV0aWxhdGlvbiIsImRpc21lbWJlcm1lbnQiLCJ0b3J0dXJlIiwid2F0ZXJib2FyZGluZyIs" +
  "ImVsZWN0cm9jdXRpb24iLCJkZWNhcGl0YXRpb24iLCJiZWhlYWRpbmciLCJzdG9uaW5nIiwibWFzcyBtdXJkZXIiLCJzZXJpYWwga2lsbGVyIG1ldGhvZHMi" +
  "LCJzY2hvb2wgc2hvb3RlciIsIm1hc3Mgc2hvb3RlciIsImFjdGl2ZSBzaG9vdGVyIiwiYm9tYiB0aHJlYXQiLCJ0ZXJyb3JpemUiLCJ0ZXJyb3Jpc3QgYXR0" +
  "YWNrIiwia25pZmUgYXR0YWNrIiwic3RhYmJpbmcgdmlkZW8iLCJtYWNoZXRlIGF0dGFjayIsImd1biB2aW9sZW5jZSIsInNob290aW5nIHNwcmVlIiwiY2hp" +
  "bGQgYWJ1c2UiLCJkb21lc3RpYyB2aW9sZW5jZSIsImFzc2F1bHQgYW5kIGJhdHRlcnkiLCJhZ2dyYXZhdGVkIGFzc2F1bHQiLCJoYXRlIGNyaW1lIiwibHlu" +
  "Y2ggbW9iIiwid2FyIGNyaW1lIiwiZ2Vub2NpZGUiLCJhbmltYWwgZmlnaHRpbmciLCJkb2cgZmlnaHRpbmciLCJjb2NrZmlnaHRpbmciLCJidWxsZmlnaHRp" +
  "bmciLCJhbmltYWwgdG9ydHVyZSJdLCJzZWxmSGFybUtleXdvcmRzIjpbInN1aWNpZGUiLCJzdWNpZGUiLCJzdWljaWRhbCIsInN1Y2lkYWwiLCJzdWljaWRl" +
  "IHNxdWFkIiwic3VpY2lkZSBub3RlIiwic3VpY2lkZSBwbGFuIiwic3VpY2lkZSBtZXRob2QiLCJzdWljaWRlIHNvbmciLCJzdWljaWRlIG1vdmllIiwic3Vp" +
  "Y2lkZSBzaWxlbmNlIiwic2VsZiBoYXJtIiwic2VsZi1oYXJtIiwic2VsZiBpbmp1cnkiLCJjdXR0aW5nIG15c2VsZiIsInJhem9yIGJsYWRlIGN1dHRpbmci" +
  "LCJob3cgdG8gaGFuZyIsImhvdyB0byBvdmVyZG9zZSIsImVuZGluZyBteSBsaWZlIiwiZW5kIG15IGxpZmUiLCJraWxsIG15c2VsZiIsInBybyBhbm9yZXhp" +
  "YSIsInBybyBidWxpbWlhIiwiYW5hIHRpcHMiLCJtaWEgdGlwcyIsInB1cmdpbmcgdGlwcyIsImZhc3RpbmcgdGlwcyBleHRyZW1lIiwiYm9keSBjaGVja2lu" +
  "ZyIsImNhbG9yaWUgcmVzdHJpY3Rpb24gZXh0cmVtZSIsInRoaWdoIGdhcCBjaGFsbGVuZ2UiLCJjb2xsYXJib25lIGNoYWxsZW5nZSJdLCJjcmltZUtleXdv" +
  "cmRzIjpbImhvdyB0byBoYWNrIiwiaGFja2luZyB0dXRvcmlhbCIsInBoaXNoaW5nIGF0dGFjayIsInBoaXNoaW5nIGtpdCIsInJhbnNvbXdhcmUiLCJtYWx3" +
  "YXJlIGNyZWF0aW9uIiwiZGRvcyBhdHRhY2siLCJkZG9zIHNlcnZpY2UiLCJjcmVkaXQgY2FyZCBkdW1wIiwic3RvbGVuIGNyZWRpdCBjYXJkcyIsImZha2Ug" +
  "aWQgbWFrZXIiLCJjb3VudGVyZmVpdCIsIm1vbmV5IGxhdW5kZXJpbmciLCJ0YXggZXZhc2lvbiIsImh1bWFuIHRyYWZmaWNraW5nIiwic211Z2dsaW5nIiwi" +
  "Y2hpbGQgZXhwbG9pdGF0aW9uIiwiY2hpbGQgdHJhZmZpY2tpbmciLCJpZGVudGl0eSBmcmF1ZCIsIndpcmUgZnJhdWQiLCJwb256aSBzY2hlbWUiLCJweXJh" +
  "bWlkIHNjaGVtZSIsImluc3VyYW5jZSBmcmF1ZCIsImJlbmVmaXQgZnJhdWQiLCJyZXZlbmdlIHBvcm4iLCJzZXh0b3J0aW9uIiwiYmxhY2ttYWlsIiwiZGFy" +
  "ayB3ZWIgbWFya2V0Iiwic2lsayByb2FkIiwiaGl0bWFuIGZvciBoaXJlIiwibXVyZGVyIGZvciBoaXJlIiwiYXJzb24gZ3VpZGUiLCJob3cgdG8gY29tbWl0" +
  "IGFyc29uIiwic3RhbGtpbmcgZ3VpZGUiLCJjeWJlcnN0YWxraW5nIiwiZG94eGluZyIsInN3YXR0aW5nIl0sImhhdGVLZXl3b3JkcyI6WyJ3aGl0ZSBzdXBy" +
  "ZW1hY2lzdCIsIndoaXRlIG5hdGlvbmFsaXN0IiwibmVvIG5hemkiLCJuYXppIHByb3BhZ2FuZGEiLCJrdSBrbHV4IGtsYW4iLCJra2siLCJyYWNlIHdhciIs" +
  "InJhY2lhbCBwdXJpdHkiLCJhbnRpc2VtaXRpc20iLCJob2xvY2F1c3QgZGVuaWFsIiwiaXNsYW1vcGhvYmlhIiwiYW50aSBtdXNsaW0iLCJob21vcGhvYmlh" +
  "IiwiY29udmVyc2lvbiB0aGVyYXB5IiwidHJhbnNwaG9iaWEiLCJhbnRpIGxnYnRxIiwiaW5jZWwgbW92ZW1lbnQiLCJibGFja3BpbGwiLCJyYWRpY2FsaXph" +
  "dGlvbiIsImV4dHJlbWlzdCByZWNydWl0bWVudCIsIm1hbmlmZXN0byBzaG9vdGVyIiwibG9uZSB3b2xmIGF0dGFjayIsImV0aG5pYyBzdXByZW1hY3kiLCJy" +
  "YWNpYWwgc3VwZXJpb3JpdHkiXSwiaW1hZ2VDb25maWciOnsibWluV2lkdGgiOjgwLCJtaW5IZWlnaHQiOjgwLCJ0aHJlc2hvbGRzIjp7IlBvcm4iOjAuMywi" +
  "SGVudGFpIjowLjQsIlNleHkiOjAuNTV9LCJjYWNoZU1heFNpemUiOjUwMCwibWF4Q29uY3VycmVudFNjYW5zIjozLCJzY2FuRGVib3VuY2VNcyI6MTUwfSwi" +
  "eW91dHViZUNhcmRTZWxlY3RvcnMiOlsieXRkLXZpZGVvLXJlbmRlcmVyIiwieXRkLWNvbXBhY3QtdmlkZW8tcmVuZGVyZXIiLCJ5dGQtZ3JpZC12aWRlby1y" +
  "ZW5kZXJlciIsInl0ZC1yaWNoLWl0ZW0tcmVuZGVyZXIiLCJ5dGQtcmVlbC1pdGVtLXJlbmRlcmVyIiwieXRkLXBsYXlsaXN0LXBhbmVsLXZpZGVvLXJlbmRl" +
  "cmVyIiwibGkuc2JzYl9jIiwiZGl2LnNicXNfYyIsIi55dGQtc2VhcmNoYm94LXNwdCIsInl0ZC1zZWFyY2gtc3VnZ2VzdGlvbi1yZW5kZXJlciIsImRpdi5n" +
  "IiwiZGl2LmctYmxrIl0sImNzc0NsYXNzZXMiOnsiYmx1cnJlZEltYWdlIjoiZGlhbW9uZC1ibHVycmVkLWltZyIsImhpZGRlbkVsZW1lbnQiOiJkaWFtb25k" +
  "LWhpZGRlbiIsInJlZGFjdGVkVGV4dCI6ImRpYW1vbmQtcmVkYWN0ZWQiLCJzY2FubmluZyI6ImRpYW1vbmQtc2Nhbm5pbmcifX0="
);

// ─── Type Definitions ───────────────────────────────────────────

export interface ImageAnalysisConfig {
  minWidth: number;
  minHeight: number;
  thresholds: { Porn: number; Hentai: number; Sexy: number };
  cacheMaxSize: number;
  maxConcurrentScans: number;
  scanDebounceMs: number;
}

export interface CssClassNames {
  blurredImage: string;
  hiddenElement: string;
  redactedText: string;
  scanning: string;
}

// ─── Domain Pattern Exports (Layer 3: URL Blocking) ─────────────

export const ADULT_DOMAIN_PATTERNS: string[] = _RAW.adultDomains || [];
export const ADULT_TLDS: string[] = _RAW.adultTlds || [];
export const GAMBLING_PATTERNS: string[] = _RAW.gamblingDomains || [];
export const PIRACY_PATTERNS: string[] = _RAW.piracyDomains || [];
export const SOCIAL_MEDIA_DOMAINS: string[] = _RAW.socialMediaDomains || [];
export const GAMING_DOMAINS: string[] = _RAW.gamingDomains || [];
export const VPN_PROXY_DOMAINS: string[] = _RAW.vpnProxyDomains || [];
export const URL_SHORTENER_DOMAINS: string[] = _RAW.urlShortenerDomains || [];

// ─── Keyword Token Exports (Layer 3: URL Keyword Analysis) ──────

export const ADULT_TOKENS: Set<string> = new Set(_RAW.adultTokens || []);
export const GAMBLING_TOKENS: Set<string> = new Set(_RAW.gamblingTokens || []);

// ─── Content Keyword Exports (Layer 4: DOM Text Scanning) ───────

export const EXPLICIT_KEYWORDS: Set<string> = new Set(_RAW.explicitKeywords || []);
export const SUGGESTIVE_PHRASES: string[] = _RAW.suggestivePhrases || [];
export const YOUTUBE_TITLE_PATTERNS: string[] = _RAW.youtubeTitlePatterns || [];
export const HIGH_CONFIDENCE_TOKENS: Set<string> = new Set(_RAW.highConfidenceTokens || []);
export const DRUG_KEYWORDS: string[] = _RAW.drugKeywords || [];
export const VIOLENCE_KEYWORDS: string[] = _RAW.violenceKeywords || [];
export const SELF_HARM_KEYWORDS: string[] = _RAW.selfHarmKeywords || [];
export const CRIME_KEYWORDS: string[] = _RAW.crimeKeywords || [];
export const HATE_KEYWORDS: string[] = _RAW.hateKeywords || [];

// ─── Image Analysis Exports (Layer 5: ML Image Scanning) ────────

export const YOUTUBE_CARD_SELECTORS: string[] = _RAW.youtubeCardSelectors || [];

export const IMAGE_CONFIG: ImageAnalysisConfig = _RAW.imageConfig || {
  minWidth: 80, minHeight: 80,
  thresholds: { Porn: 0.30, Hentai: 0.40, Sexy: 0.55 },
  cacheMaxSize: 500, maxConcurrentScans: 3, scanDebounceMs: 150,
};

export const DIAMOND_CSS: CssClassNames = _RAW.cssClasses || {
  blurredImage: 'diamond-blurred-img',
  hiddenElement: 'diamond-hidden',
  redactedText: 'diamond-redacted',
  scanning: 'diamond-scanning',
};
