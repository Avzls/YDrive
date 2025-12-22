import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Modules
import { StorageModule } from '@modules/storage/storage.module';
import { AuthModule } from '@modules/auth/auth.module';
import { FilesModule } from '@modules/files/files.module';
import { FoldersModule } from '@modules/folders/folders.module';
import { PermissionsModule } from '@modules/permissions/permissions.module';
import { SharingModule } from '@modules/sharing/sharing.module';
import { AuditModule } from '@modules/audit/audit.module';
import { JobsModule } from './jobs/jobs.module';

// Entities
import { User } from '@modules/users/entities/user.entity';
import { File } from '@modules/files/entities/file.entity';
import { FileVersion } from '@modules/files/entities/file-version.entity';
import { Folder } from '@modules/folders/entities/folder.entity';
import { Permission } from '@modules/permissions/entities/permission.entity';
import { ShareLink } from '@modules/sharing/entities/share-link.entity';
import { AuditLog } from '@modules/audit/entities/audit-log.entity';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: parseInt(configService.get('DATABASE_PORT', '5432')),
        username: configService.get('DATABASE_USER', 'postgres'),
        password: configService.get('DATABASE_PASSWORD', 'postgres'),
        database: configService.get('DATABASE_NAME', 'filestorage'),
        entities: [User, File, FileVersion, Folder, Permission, ShareLink, AuditLog],
        synchronize: false,
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Redis + BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: parseInt(configService.get('REDIS_PORT', '6379')),
        },
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    StorageModule,
    AuthModule,
    FilesModule,
    FoldersModule,
    PermissionsModule,
    SharingModule,
    AuditModule,
    JobsModule,
  ],
})
export class AppModule {}
