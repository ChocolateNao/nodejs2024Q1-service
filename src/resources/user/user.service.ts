import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from './dto/update-user-password.dto';
import { processUserRes } from 'src/utils/processUserRes';
import { validate } from 'uuid';
import { User } from './entities/user.entity';
import { UserResponse } from './entities/user-res.entity';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private async getUserByIdFull(
    id: string,
    isPasswordHidden = false,
  ): Promise<User | UserResponse> {
    if (!validate(id)) throw new BadRequestException('Invalid userId');

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (isPasswordHidden) {
      return processUserRes(user);
    }
    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    const saltRounds = +process.env.CRYPT_SALT ?? 1;
    const hashedPassword = await bcrypt.hash(
      createUserDto.password,
      saltRounds,
    );
    const user: User = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        refreshToken: '',
      },
    });
    return processUserRes(user);
  }

  async findAll(): Promise<UserResponse[]> {
    const users: User[] = await this.prisma.user.findMany();
    return users.map((user) => processUserRes(user));
  }

  async findOne(id: string): Promise<UserResponse> {
    return (await this.getUserByIdFull(id, true)) as UserResponse;
  }

  async updatePassword(
    id: string,
    updatePasswordDto: UpdatePasswordDto,
  ): Promise<UserResponse> {
    const userFull = (await this.getUserByIdFull(id)) as User;
    if (
      (await bcrypt.compare(
        updatePasswordDto.oldPassword,
        userFull.password,
      )) === false
    )
      throw new ForbiddenException('Invalid old password');

    if (
      (await bcrypt.compare(
        updatePasswordDto.newPassword,
        userFull.password,
      )) === false
    ) {
      const saltRounds = +process.env.CRYPT_SALT ?? 1;
      const updatedPassword = await bcrypt.hash(
        updatePasswordDto.newPassword,
        saltRounds,
      );

      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: {
          password: updatedPassword,
          version: {
            increment: 1,
          },
        },
      });
      return processUserRes(updatedUser);
    }
    return processUserRes(userFull);
  }

  async remove(id: string): Promise<void> {
    const userToDelete = (await this.getUserByIdFull(id)) as User;
    await this.prisma.user.delete({ where: { id: userToDelete.id } });
  }
}
