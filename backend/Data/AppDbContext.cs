using Microsoft.EntityFrameworkCore;

public class AppDbContext : DbContext
{
    public DbSet<Song> Songs { get; set; }

    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Настройка начальных данных
        modelBuilder.Entity<Song>().HasData(
            new Song { Id = 1, Title = "Bohemian Rhapsody", FilePath = "songs/imagine.mp3", Artist = "Queen", Duration = 354 },
            new Song { Id = 2, Title = "Imagine", FilePath = "songs/imagine.mp3", Artist = "John Lennon", Duration = 183 }
        );
    }
}