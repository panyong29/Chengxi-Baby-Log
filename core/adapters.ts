// 平台适配器接口：RN 实现在下面，小程序迁移时只需实现这套接口，
// core/ 与 sync/ 的业务逻辑一行不用改。
// 适配器只做一件事：把平台能力翻译成这套接口。

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export interface NetworkMonitor {
  isOnline(): Promise<boolean>;
  onChange(cb: (online: boolean) => void): () => void;
}

export interface SecureVault {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export interface Notifier {
  requestPermission(): Promise<boolean>;
  schedule(title: string, body: string, secondsFromNow: number): Promise<void>;
  cancelAll(): Promise<void>;
}

// ---------- React Native 实现 ----------
// 注意：小程序侧对应实现：
//   KeyValueStore -> wx.setStorageSync / wx.getStorageSync
//   NetworkMonitor -> wx.getNetworkType + wx.onNetworkStatusChange
//   SecureVault   -> 小程序沙箱存储（同 AppId 隔离，够用）
//   Notifier      -> 微信订阅消息（wx.requestSubscribeMessage，需用户授权模板）

import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

// O5：kvStore（MemoryKV）与 notifier 的实现已删除——全工程无人引用。
// 接口定义保留在上面，小程序迁移时按接口实现即可。

export const vault: SecureVault = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
  del: (k) => SecureStore.deleteItemAsync(k),
};

export const network: NetworkMonitor = {
  isOnline: async () => (await NetInfo.fetch()).isConnected ?? false,
  onChange: (cb) => {
    const sub = NetInfo.addEventListener((s) => cb(!!s.isConnected));
    return () => sub();
  },
};
