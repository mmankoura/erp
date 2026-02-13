import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../entities/user.entity';
import { CreateUserDto, UpdateUserDto } from './dto';
import { AuditService } from '../audit/audit.service';
import { AuditEventType, AuditEntityType } from '../../entities/audit-event.entity';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private auditService: AuditService,
  ) {}

  /**
   * Validate user credentials for login.
   * Supports both username and email for the username field.
   */
  async validateUser(username: string, password: string): Promise<User | null> {
    // Find user by username or email, including password_hash
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.username = :username OR user.email = :username', {
        username,
      })
      .getOne();

    if (!user) {
      return null;
    }

    // Check if user is active
    if (!user.is_active) {
      return null;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return null;
    }

    // Update last login timestamp
    await this.userRepository.update(user.id, { last_login_at: new Date() });

    // Remove password_hash from returned user
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  /**
   * Find user by ID.
   */
  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * Get all users (admin only).
   */
  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      order: { created_at: 'DESC' },
      relations: ['creator'],
    });
  }

  /**
   * Create a new user (admin only).
   */
  async createUser(dto: CreateUserDto, createdBy: User): Promise<User> {
    // Check for existing username
    const existingUsername = await this.userRepository.findOne({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    // Check for existing email (only if email provided)
    if (dto.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    // Hash password
    const password_hash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Create user
    const user = this.userRepository.create({
      email: dto.email || null,
      username: dto.username,
      password_hash,
      full_name: dto.full_name,
      role: dto.role || UserRole.OPERATOR,
      is_active: dto.is_active ?? true,
      created_by: createdBy.id,
    });

    const savedUser = await this.userRepository.save(user);

    // Audit log
    await this.auditService.emit({
      event_type: AuditEventType.USER_CREATED,
      entity_type: AuditEntityType.USER,
      entity_id: savedUser.id,
      actor: createdBy.username,
      new_value: {
        username: savedUser.username,
        email: savedUser.email,
        role: savedUser.role,
        is_active: savedUser.is_active,
      },
    });

    return savedUser;
  }

  /**
   * Update a user (admin only).
   */
  async updateUser(
    id: string,
    dto: UpdateUserDto,
    updatedBy: User,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldValue = {
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      full_name: user.full_name,
    };

    // Check for username/email conflicts
    if (dto.username || dto.email) {
      const existing = await this.userRepository
        .createQueryBuilder('user')
        .where('user.id != :id', { id })
        .andWhere('(user.username = :username OR user.email = :email)', {
          username: dto.username || '',
          email: dto.email || '',
        })
        .getOne();

      if (existing) {
        if (existing.username === dto.username) {
          throw new ConflictException('Username already exists');
        }
        throw new ConflictException('Email already exists');
      }
    }

    // Update fields
    if (dto.email) user.email = dto.email;
    if (dto.username) user.username = dto.username;
    if (dto.full_name) user.full_name = dto.full_name;
    if (dto.role) user.role = dto.role;
    if (dto.is_active !== undefined) user.is_active = dto.is_active;

    // Update password if provided
    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);
    }

    const updatedUser = await this.userRepository.save(user);

    // Audit log
    await this.auditService.emit({
      event_type: AuditEventType.USER_UPDATED,
      entity_type: AuditEntityType.USER,
      entity_id: updatedUser.id,
      actor: updatedBy.username,
      old_value: oldValue,
      new_value: {
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        is_active: updatedUser.is_active,
        full_name: updatedUser.full_name,
      },
    });

    return updatedUser;
  }

  /**
   * Create the initial admin user if no users exist.
   * Called during application bootstrap.
   */
  async ensureAdminExists(): Promise<void> {
    const userCount = await this.userRepository.count();
    if (userCount === 0) {
      const password_hash = await bcrypt.hash('admin123', this.SALT_ROUNDS);
      const admin = this.userRepository.create({
        email: 'admin@erp.local',
        username: 'admin',
        password_hash,
        full_name: 'System Administrator',
        role: UserRole.ADMIN,
        is_active: true,
      });
      await this.userRepository.save(admin);
      console.log(
        '⚠️  Initial admin user created. Username: admin, Password: admin123',
      );
      console.log('⚠️  Please change the admin password after first login!');
    }
  }
}
