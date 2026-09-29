import { Category, Product, Cart, Order, StoreSettings, User } from '../core/types.ts';

class ApiClient {
  private currentUserId: string = 'user_buyer_1';
  private initData: string = '';

  public setUserId(id: string) {
    this.currentUserId = id;
  }

  public getUserId(): string {
    return this.currentUserId;
  }

  public setInitData(data: string) {
    this.initData = data;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (this.initData) {
      headers.set('x-telegram-init-data', this.initData);
    }
    if (this.currentUserId) {
      headers.set('x-user-id', this.currentUserId);
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(message);
    }

    return response.json();
  }

  // Public / Catalog
  public getStore(): Promise<StoreSettings> {
    return this.request<StoreSettings>('/api/store');
  }

  public getCategories(): Promise<Category[]> {
    return this.request<Category[]>('/api/categories');
  }

  public getProducts(categoryId?: string, search?: string): Promise<Product[]> {
    const params = new URLSearchParams();
    if (categoryId) params.set('categoryId', categoryId);
    if (search) params.set('search', search);
    return this.request<Product[]>(`/api/products?${params.toString()}`);
  }

  public getProduct(id: string): Promise<Product> {
    return this.request<Product>(`/api/products/${id}`);
  }

  // Auth
  public authTelegram(initData?: string, mockUser?: any): Promise<{ user: User; token: string }> {
    return this.request<{ user: User; token: string }>('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData, mockUser }),
    });
  }

  public getMe(): Promise<User> {
    return this.request<User>('/api/auth/me');
  }

  // Cart
  public getCart(): Promise<Cart> {
    return this.request<Cart>('/api/cart');
  }

  public addToCart(productId: string, variantId: string, quantity = 1): Promise<Cart> {
    return this.request<Cart>('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, variantId, quantity }),
    });
  }

  public updateCartItem(itemId: string, quantity: number): Promise<Cart> {
    return this.request<Cart>(`/api/cart/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
  }

  public removeFromCart(itemId: string): Promise<Cart> {
    return this.request<Cart>(`/api/cart/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  public clearCart(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/api/cart', {
      method: 'DELETE',
    });
  }

  // Orders
  public createOrder(data: {
    customerName: string;
    customerPhone: string;
    customerUsername?: string;
    deliveryMethod: 'DELIVERY' | 'PICKUP';
    deliveryAddress?: string;
    comment?: string;
    paymentProvider?: string;
  }): Promise<Order> {
    return this.request<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public getOrders(): Promise<Order[]> {
    return this.request<Order[]>('/api/orders');
  }

  public getOrder(id: string): Promise<Order> {
    return this.request<Order>(`/api/orders/${id}`);
  }

  // Payments
  public createPayment(orderId: string, returnUrl?: string): Promise<any> {
    return this.request<any>(`/api/orders/${orderId}/payment`, {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
  }

  public simulateMockPayment(params: {
    orderId: string;
    providerPaymentId?: string;
    status: 'PAID' | 'FAILED';
    amount?: number;
    isDuplicate?: boolean;
  }): Promise<any> {
    return this.request<any>('/api/payments/mock-simulate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Admin
  public getAdminDashboard(): Promise<any> {
    return this.request<any>('/api/admin/dashboard');
  }

  public getAdminProducts(): Promise<Product[]> {
    return this.request<Product[]>('/api/admin/products');
  }

  public createAdminProduct(data: any): Promise<Product> {
    return this.request<Product>('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public updateAdminProduct(id: string, data: any): Promise<Product> {
    return this.request<Product>(`/api/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public deleteAdminProduct(id: string): Promise<any> {
    return this.request<any>(`/api/admin/products/${id}`, {
      method: 'DELETE',
    });
  }

  public createAdminCategory(data: any): Promise<Category> {
    return this.request<Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public updateAdminCategory(id: string, data: any): Promise<Category> {
    return this.request<Category>(`/api/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public deleteAdminCategory(id: string): Promise<any> {
    return this.request<any>(`/api/admin/categories/${id}`, {
      method: 'DELETE',
    });
  }

  public getAdminOrders(filters?: { status?: string; paymentStatus?: string; search?: string }): Promise<Order[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
    if (filters?.search) params.set('search', filters.search);
    return this.request<Order[]>(`/api/admin/orders?${params.toString()}`);
  }

  public updateAdminOrderStatus(orderId: string, status: string): Promise<Order> {
    return this.request<Order>(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  public getAdminCustomers(): Promise<any[]> {
    return this.request<any[]>('/api/admin/customers');
  }

  public updateAdminSettings(settings: Partial<StoreSettings>): Promise<StoreSettings> {
    return this.request<StoreSettings>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  public getAdminNotifications(): Promise<any[]> {
    return this.request<any[]>('/api/admin/notifications');
  }
}

export const api = new ApiClient();
