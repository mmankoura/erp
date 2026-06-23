import { RolePermissions, UserRole } from './user.entity';

describe('RolePermissions', () => {
  describe('canManageUsers', () => {
    it('allows ADMIN only', () => {
      expect(RolePermissions.canManageUsers(UserRole.ADMIN)).toBe(true);
      expect(RolePermissions.canManageUsers(UserRole.MANAGER)).toBe(false);
      expect(RolePermissions.canManageUsers(UserRole.WAREHOUSE_CLERK)).toBe(false);
      expect(RolePermissions.canManageUsers(UserRole.OPERATOR)).toBe(false);
    });
  });

  describe('canAccessSettings', () => {
    it('allows ADMIN only', () => {
      expect(RolePermissions.canAccessSettings(UserRole.ADMIN)).toBe(true);
      expect(RolePermissions.canAccessSettings(UserRole.MANAGER)).toBe(false);
      expect(RolePermissions.canAccessSettings(UserRole.WAREHOUSE_CLERK)).toBe(false);
      expect(RolePermissions.canAccessSettings(UserRole.OPERATOR)).toBe(false);
    });
  });

  describe('canEdit', () => {
    it('allows ADMIN and MANAGER, blocks lower roles', () => {
      expect(RolePermissions.canEdit(UserRole.ADMIN)).toBe(true);
      expect(RolePermissions.canEdit(UserRole.MANAGER)).toBe(true);
      expect(RolePermissions.canEdit(UserRole.WAREHOUSE_CLERK)).toBe(false);
      expect(RolePermissions.canEdit(UserRole.OPERATOR)).toBe(false);
    });
  });

  describe('canPerformInventoryOps', () => {
    it('allows ADMIN, MANAGER, WAREHOUSE_CLERK; blocks OPERATOR', () => {
      expect(RolePermissions.canPerformInventoryOps(UserRole.ADMIN)).toBe(true);
      expect(RolePermissions.canPerformInventoryOps(UserRole.MANAGER)).toBe(true);
      expect(RolePermissions.canPerformInventoryOps(UserRole.WAREHOUSE_CLERK)).toBe(true);
      expect(RolePermissions.canPerformInventoryOps(UserRole.OPERATOR)).toBe(false);
    });
  });

  describe('canView', () => {
    it('always returns true', () => {
      expect(RolePermissions.canView()).toBe(true);
    });
  });

  describe('UserRole enum', () => {
    it('has all four canonical values', () => {
      expect(UserRole.ADMIN).toBe('ADMIN');
      expect(UserRole.MANAGER).toBe('MANAGER');
      expect(UserRole.WAREHOUSE_CLERK).toBe('WAREHOUSE_CLERK');
      expect(UserRole.OPERATOR).toBe('OPERATOR');
    });

    it('exposes exactly four roles', () => {
      const values = Object.values(UserRole);
      expect(values).toHaveLength(4);
    });
  });
});
