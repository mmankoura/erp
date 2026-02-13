import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { User } from '../../entities/user.entity';
import { AuthService } from './auth.service';

/**
 * Serializer for Passport session management.
 * Handles storing and retrieving user data from the session.
 */
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private authService: AuthService) {
    super();
  }

  /**
   * Serialize user to session - store only the user ID.
   */
  serializeUser(user: User, done: (err: Error | null, id?: string) => void) {
    done(null, user.id);
  }

  /**
   * Deserialize user from session - retrieve full user by ID.
   */
  async deserializeUser(
    userId: string,
    done: (err: Error | null, user?: User | null) => void,
  ) {
    const user = await this.authService.findById(userId);
    done(null, user);
  }
}
