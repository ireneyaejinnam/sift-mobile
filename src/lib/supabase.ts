import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoCrypto from 'expo-crypto';

// Polyfill WebCrypto subtle.digest for PKCE SHA-256 support
if (typeof global.crypto === 'undefined' || !(global.crypto as any).subtle) {
  const subtleShim = {
    digest: async (_algorithm: string, data: ArrayBuffer) => {
      const bytes = new Uint8Array(data);
      const hex = await ExpoCrypto.digestStringAsync(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        String.fromCharCode(...bytes),
        { encoding: ExpoCrypto.CryptoEncoding.HEX }
      );
      const result = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
      return result.buffer;
    },
  };
  (global as any).crypto = {
    ...(global.crypto ?? {}),
    getRandomValues: ExpoCrypto.getRandomValues,
    subtle: subtleShim,
  };
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          flowType: 'pkce',
        },
      })
    : null;
