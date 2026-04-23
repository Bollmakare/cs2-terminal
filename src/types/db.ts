export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      alerts: {
        Row: {
          alert_type: string
          cooldown_min: number | null
          created_at: string
          id: string
          is_active: boolean
          item_id: string | null
          item_name: string
          last_checked_at: string | null
          notify_email: boolean
          notify_inapp: boolean
          ref_price: number | null
          target_pct: number | null
          target_price: number | null
          target_score: number | null
          trigger_count: number
          trigger_value: number | null
          triggered_at: string | null
          user_id: string
        }
      }
      holdings: {
        Row: {
          acquired_at: string
          cost_basis: number
          created_at: string
          float_value: number | null
          group_label: string | null
          id: string
          is_stattrak: boolean
          item_category: string | null
          item_condition: string | null
          item_id: string | null
          item_name: string
          last_price: number | null
          note: string | null
          pattern_id: number | null
          portfolio_id: string
          price_source: string
          price_updated_at: string | null
          quantity: number
          steam_asset_id: string | null
          stickers: Json
          storage_unit: string | null
          updated_at: string
          user_id: string
        }
      }
      items: {
        Row: {
          arb_buy_market: string | null
          arb_sell_market: string | null
          arb_spread_pct: number | null
          category: string
          collection: string | null
          condition: string | null
          created_at: string
          icon_url: string | null
          id: string
          inspect_link: string | null
          is_souvenir: boolean
          is_stattrak: boolean
          market_hash_name: string
          price_buff: number | null
          price_csfloat: number | null
          price_lis_skins: number | null
          price_skinport: number | null
          price_steam: number | null
          price_usd: number | null
          price_7d_avg: number | null
          price_7d_change_pct: number | null
          price_30d_avg: number | null
          price_30d_change_pct: number | null
          rarity: string | null
          rarity_color: string | null
          skin_name: string
          updated_at: string
          volume_24h: number | null
          volume_7d: number | null
          weapon_type: string
        }
      }
      portfolios: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
      }
      profiles: {
        Row: {
          auth_provider: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          steam_avatar: string | null
          steam_id: string | null
          steam_username: string | null
          updated_at: string
        }
      }
      watchlist: {
        Row: {
          added_at: string
          alert_buy: number | null
          alert_sell: number | null
          id: string
          item_id: string | null
          item_name: string
          note: string | null
          user_id: string
        }
      }
    }
  }
}
