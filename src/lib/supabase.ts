import {createClient} from '@supabase/supabase-js'
export const URL_SB = import.meta.env.VITE_SUPABASE_URL
export const KEY_SB = import.meta.env.VITE_SUPABASE_ANON_KEY
export const sb = createClient(URL_SB, KEY_SB)
export const bob = (n:any) => 'Bs ' + Number(n||0).toFixed(2)
