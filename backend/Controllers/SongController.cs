using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/[controller]")]
public class SongsController : ControllerBase
{
    private readonly AppDbContext _context;

    public SongsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var songs = await _context.Songs.ToListAsync();
        return Ok(songs);
    }

    [HttpPost]
    public async Task<IActionResult> Add([FromBody] Song song)
    {
        _context.Songs.Add(song);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = song.Id }, song);
    }
}