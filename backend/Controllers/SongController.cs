// Controllers/SongsController.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IO;

[Route("api/[controller]")]
[ApiController]
public class SongsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IWebHostEnvironment _environment;

    public SongsController(AppDbContext context, IWebHostEnvironment environment)
    {
        _context = context;
        _environment = environment;
    }

    // GET: api/Songs
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Song>>> GetSongs()
    {
        return await _context.Songs.ToListAsync();
    }

    // GET: api/Songs/5
    [HttpGet("{id}")]
    public async Task<ActionResult<Song>> GetSong(int id)
    {
        var song = await _context.Songs.FindAsync(id);

        if (song == null)
        {
            return NotFound();
        }

        return song;
    }

    // POST: api/Songs
    [HttpPost]
    public async Task<ActionResult<Song>> PostSong([FromForm] SongUploadDto songDto)
    {
        // Проверяем наличие файла
        if (songDto.File == null || songDto.File.Length == 0)
        {
            return BadRequest("Файл не предоставлен или пустой.");
        }

        // Создаем директорию, если она не существует
        var uploadsFolder = Path.Combine(_environment.WebRootPath, "songs");
        if (!Directory.Exists(uploadsFolder))
        {
            Directory.CreateDirectory(uploadsFolder);
        }

        // Генерируем уникальное имя файла
        var uniqueFileName = Guid.NewGuid().ToString() + Path.GetExtension(songDto.File.FileName);
        var filePath = Path.Combine(uploadsFolder, uniqueFileName);

        // Сохраняем файл
        using (var fileStream = new FileStream(filePath, FileMode.Create))
        {
            await songDto.File.CopyToAsync(fileStream);
        }

        // Создаем новую запись песни
        var song = new Song
        {
            Title = songDto.Title,
            Artist = songDto.Artist,
            Duration = songDto.Duration,
            FilePath = "songs/" + uniqueFileName
        };

        _context.Songs.Add(song);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetSong), new { id = song.Id }, song);
    }

    // DELETE: api/Songs/5
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteSong(int id)
    {
        var song = await _context.Songs.FindAsync(id);
        if (song == null)
        {
            return NotFound();
        }

        // Удаляем физический файл
        var filePath = Path.Combine(_environment.WebRootPath, song.FilePath);
        if (System.IO.File.Exists(filePath))
        {
            System.IO.File.Delete(filePath);
        }

        _context.Songs.Remove(song);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}