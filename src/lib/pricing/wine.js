export function buildWineSearchUrl(name, vintage, producer) {
  const parts = [name, vintage, producer].filter(Boolean).join('+').replace(/\s+/g, '+')
  return `https://www.wine-searcher.com/find/${parts}`
}

export function openWineSearcher(name, vintage, producer) {
  const url = buildWineSearchUrl(name, vintage, producer)
  window.open(url, '_blank', 'noopener,noreferrer')
}
