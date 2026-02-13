import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

/**
 * User roles with specific permissions:
 * - ADMIN: Full access including user management and settings
 * - MANAGER: Full access EXCEPT settings/user management
 * - WAREHOUSE_CLERK: Receiving, kitting, pick/issue, return to stock, cycle counts
 * - OPERATOR: View only - can view orders, inventory, kitted materials - NO editing
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  WAREHOUSE_CLERK = 'WAREHOUSE_CLERK',
  OPERATOR = 'OPERATOR',
}

/**
 * Permission helper functions for role-based access control
 */
export const RolePermissions = {
  canManageUsers: (role: UserRole): boolean => role === UserRole.ADMIN,
  canAccessSettings: (role: UserRole): boolean => role === UserRole.ADMIN,
  canEdit: (role: UserRole): boolean =>
    role === UserRole.ADMIN || role === UserRole.MANAGER,
  canPerformInventoryOps: (role: UserRole): boolean =>
    role === UserRole.ADMIN ||
    role === UserRole.MANAGER ||
    role === UserRole.WAREHOUSE_CLERK,
  canView: (): boolean => true, // All authenticated users can view
};

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true, where: '"email" IS NOT NULL' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  username: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password_hash: string;

  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  @Index()
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.OPERATOR,
  })
  role: UserRole;

  @Index()
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  last_login_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
