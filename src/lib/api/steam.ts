const STEAM_KEY = process.env.STEAM_API_KEY ?? ''

export async function getSteamInventory(steamId: string, retries = 3): Promise<unknown[]> {
  const url = `https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=5000`
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const r = await fetch(url, { next: { revalidate: 300 } })
      
      if (r.status === 429) {
        // Rate limited — wait before retry
        await new Promise(res => setTimeout(res, (attempt + 1) * 2000))
        continue
      }
      
      if (!r.ok) return []
      const data = await r.json()
      
      if (!data.assets || !data.descriptions) return []
      
      // Merge assets with descriptions
      const descMap = new Map(
        data.descriptions.map((d: Record<string, unknown>) => [`${d.classid}_${d.instanceid}`, d])
      )
      
      return data.assets
        .map((asset: Record<string, unknown>) => {
          const desc = descMap.get(`${asset.classid}_${asset.instanceid}`)
          if (!desc) return null
          return { ...asset, ...desc }
        })
        .filter(Boolean)
    } catch {
      if (attempt === retries - 1) return []
      await new Promise(res => setTimeout(res, 1000))
    }
  }
  return []
}

export async function getSteamProfile(steamId: string) {
  if (!STEAM_KEY) return null
  try {
    const r = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamId}`,
      { next: { revalidate: 3600 } }
    )
    if (!r.ok) return null
    const data = await r.json()
    return data.response?.players?.[0] ?? null
  } catch { return null }
}
