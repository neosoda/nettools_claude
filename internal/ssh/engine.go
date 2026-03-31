package ssh

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// Job represents a single SSH task
type Job struct {
	DeviceID string
	IP       string
	Port     int
	Vendor   string
	Commands []string
	Params   ConnectParams
	Timeout  time.Duration
	MaxRetry int
}

// Result holds the output from a completed job
type Result struct {
	DeviceID string
	IP       string
	Outputs  map[string]string // command -> output
	Error    error
	Duration time.Duration
}

// Engine manages a pool of concurrent SSH workers
type Engine struct {
	workers int
	jobs    chan Job
	results chan Result
	wg      sync.WaitGroup
}

func NewEngine(workers int) *Engine {
	if workers <= 0 {
		workers = 10
	}
	return &Engine{
		workers: workers,
		jobs:    make(chan Job, 100),
		results: make(chan Result, 100),
	}
}

func (e *Engine) Start(ctx context.Context) {
	for i := 0; i < e.workers; i++ {
		e.wg.Add(1)
		go e.worker(ctx)
	}
}

func (e *Engine) Stop() {
	close(e.jobs)
	e.wg.Wait()
	close(e.results)
}

func (e *Engine) Submit(job Job) {
	e.jobs <- job
}

func (e *Engine) Results() <-chan Result {
	return e.results
}

func (e *Engine) worker(ctx context.Context) {
	defer e.wg.Done()
	for {
		select {
		case job, ok := <-e.jobs:
			if !ok {
				return
			}
			result := e.execute(ctx, job)
			select {
			case e.results <- result:
			case <-ctx.Done():
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

func (e *Engine) execute(ctx context.Context, job Job) Result {
	start := time.Now()
	r := Result{DeviceID: job.DeviceID, IP: job.IP, Outputs: make(map[string]string)}

	maxRetry := job.MaxRetry
	if maxRetry <= 0 {
		maxRetry = 2
	}

	var sess *Session
	var err error
	for attempt := 0; attempt <= maxRetry; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(2 * time.Second):
			case <-ctx.Done():
				r.Error = ctx.Err()
				return r
			}
		}
		sess, err = Connect(ctx, job.Params)
		if err == nil {
			break
		}
	}
	if err != nil {
		r.Error = fmt.Errorf("connect after %d retries: %w", maxRetry, err)
		r.Duration = time.Since(start)
		return r
	}
	defer sess.Close()

	for _, cmd := range job.Commands {
		output, cmdErr := sess.RunCommandInteractive(ctx, cmd)
		if cmdErr != nil {
			r.Outputs[cmd] = fmt.Sprintf("ERROR: %v", cmdErr)
		} else {
			r.Outputs[cmd] = output
		}
	}

	r.Duration = time.Since(start)
	return r
}

// RunSingle is a convenience function for a single device/command
func RunSingle(ctx context.Context, params ConnectParams, commands []string) (map[string]string, error) {
	engine := NewEngine(1)
	ctx2, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	engine.Start(ctx2)

	job := Job{
		IP:       params.Host,
		Commands: commands,
		Params:   params,
		Timeout:  60 * time.Second,
		MaxRetry: 1,
	}
	engine.Submit(job)
	engine.Stop()

	result := <-engine.Results()
	return result.Outputs, result.Error
}
